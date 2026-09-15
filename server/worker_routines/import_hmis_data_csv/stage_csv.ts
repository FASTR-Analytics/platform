import { Sql } from "postgres";
import { escapeSqlString } from "../../db/utils.ts";
import {
  COUNT_CHECK_CONSTRAINT,
  csvIndicatorValueFromCell,
  PERIOD_ID_CHECK_CONSTRAINT,
  isValidDatasetRow,
  parseCountValue,
  throwIfErrWithData,
  type DatasetCsvStagingResult,
  type HmisCsvColumns,
  type HmisCsvMapping,
  type PeriodIndicatorStat,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";

// Per-run staging tables (PLAN_DHIS2_IMPORTER_CONSOLIDATION A4): staging
// output must survive a needs_review hold across other imports running in
// between, so every table (the final ready-for-integration table plus the
// four throwaway intermediates) carries a _run_{runId} suffix. Dropped on
// integrate/discard/sweep: this is what makes releasing the single-running
// slot on needs_review safe.

export function hmisCsvStagingTableNames(runId: number): {
  raw: string;
  dedup: string;
  validFacilities: string;
  mapping: string;
  final: string;
} {
  const id = Math.floor(runId);
  return {
    raw: `uploaded_hmis_staging_raw_run_${id}`,
    dedup: `uploaded_hmis_staging_dedup_run_${id}`,
    validFacilities: `uploaded_hmis_staging_validfac_run_${id}`,
    mapping: `uploaded_hmis_staging_mapping_run_${id}`,
    final: `uploaded_hmis_data_staging_ready_for_integration_run_${id}`,
  };
}

export async function dropHmisCsvStagingTables(
  db: Sql,
  runId: number,
  args: { keepFinal: boolean },
): Promise<void> {
  const names = hmisCsvStagingTableNames(runId);
  const toDrop = [names.raw, names.dedup, names.validFacilities, names.mapping];
  if (!args.keepFinal) {
    toDrop.push(names.final);
  }
  for (const name of toDrop) {
    try {
      await db.unsafe(`DROP TABLE IF EXISTS ${name}`);
    } catch {
      // Cleanup is best-effort; a leftover is dropped by the boot sweep.
    }
  }
}

// Stream the CSV into a raw table, dedup, validate facilities, look each
// value of the indicator column up in the run's mapping, and build the
// final staging table. Staging resolves nothing (PLAN_A6 ruling 2): a value
// the mapping sends to a data id lands under it, a value it sends to null
// is counted and dropped, and a value absent from the mapping throws, since
// the scan and the launch pinned the same bytes and calculated the values the
// same way, so a gap is a defect. Never throws on dropped rows: the
// caller's clean-condition gate decides what a nonzero drop count means.
export async function stageHmisCsvIntoTables(args: {
  importDb: Sql;
  csvFilePath: string;
  csvFileName: string;
  columns: HmisCsvColumns;
  mapping: HmisCsvMapping;
  runId: number;
  onProgress: (percent: number) => void;
}): Promise<DatasetCsvStagingResult> {
  const {
    importDb,
    csvFilePath,
    csvFileName,
    columns,
    mapping,
    runId,
    onProgress,
  } = args;
  const names = hmisCsvStagingTableNames(runId);

  const resComponents = await getCsvStreamComponents(csvFilePath);
  throwIfErrWithData(resComponents);
  const { encodedHeaderToIndexMap, processRows } = resComponents.data;

  const columnsRecord = columns as unknown as Record<string, string>;
  const headerIndexes = {
    periodId: getCsvColumnIndex(
      encodedHeaderToIndexMap,
      columnsRecord,
      "period_id",
    ),
    facilityId: getCsvColumnIndex(
      encodedHeaderToIndexMap,
      columnsRecord,
      "facility_id",
    ),
    dataId: getCsvColumnIndex(
      encodedHeaderToIndexMap,
      columnsRecord,
      "data_id",
    ),
    count: getCsvColumnIndex(encodedHeaderToIndexMap, columnsRecord, "count"),
  } as const;

  const dateImported = new Date().toISOString();

  const fileInfo = await Deno.stat(csvFilePath);
  const fileSizeBytes = fileInfo.size;
  let lastProgressUpdate = 1;

  // Clean up any leftover tables from a previous crashed run of this id.
  await dropHmisCsvStagingTables(importDb, runId, { keepFinal: false });

  onProgress(1);

  await importDb.unsafe(`
CREATE UNLOGGED TABLE ${names.raw} (
  facility_id TEXT NOT NULL,
  data_id TEXT NOT NULL,
  period_id INTEGER NOT NULL ${PERIOD_ID_CHECK_CONSTRAINT},
  count INTEGER NOT NULL ${COUNT_CHECK_CONSTRAINT}
)`);

  let rowBuffer: string[] = [];
  const BUFFER_SIZE = 10000;
  let rowsProcessed = 0;
  let currentBytesRead = 0;

  let invalidPeriodCount = 0;
  let invalidCountCount = 0;
  let missingFieldsCount = 0;

  const flushBuffer = async () => {
    if (rowBuffer.length === 0) return;
    const valuesClause = rowBuffer.join(",\n");
    await importDb.unsafe(
      `INSERT INTO ${names.raw} (facility_id, data_id, period_id, count) VALUES ${valuesClause}`,
    );
    rowBuffer = [];

    // Progress during CSV processing ranges from 1% to 85%.
    const actualProgress = Math.min(
      1 + (currentBytesRead / fileSizeBytes) * 84,
      85,
    );
    if (actualProgress - lastProgressUpdate >= 1) {
      onProgress(actualProgress);
      lastProgressUpdate = actualProgress;
    }
  };

  await processRows(
    async (row: string[], _rowIndex: number, bytesRead: number) => {
      rowsProcessed++;
      currentBytesRead = bytesRead;

      const periodId = row[headerIndexes.periodId];
      const facilityId = row[headerIndexes.facilityId];
      const dataId = csvIndicatorValueFromCell(row[headerIndexes.dataId] ?? "");
      // Numeric cleaning only: tolerate thousands separators / stray quotes
      const count = parseCountValue(
        (row[headerIndexes.count] ?? "").replace(/[,'"]/g, ""),
      );

      const validation = isValidDatasetRow(
        periodId,
        facilityId,
        dataId,
        count,
      );
      if (!validation.isValid) {
        switch (validation.failureReason) {
          case "missing_fields":
            missingFieldsCount++;
            break;
          case "invalid_period":
            invalidPeriodCount++;
            break;
          case "invalid_count":
            invalidCountCount++;
            break;
        }
        return;
      }

      rowBuffer.push(
        `('${escapeSqlString(facilityId)}','${escapeSqlString(dataId)}','${periodId}',${count})`,
      );

      if (rowBuffer.length >= BUFFER_SIZE) {
        await flushBuffer();
      }
    },
  );

  await flushBuffer();
  onProgress(85);

  const tempCount = await importDb<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM ${importDb(names.raw)}
  `;
  const rowsAfterCsvValidation = tempCount[0]?.count || 0;

  if (rowsAfterCsvValidation === 0) {
    // No staging content exists: this fails the run loudly (the caller's
    // error path drops the tables) rather than holding for review.
    throw new Error(
      `No valid data rows were found in the CSV (${rowsProcessed} rows processed): ` +
        `${missingFieldsCount} with missing required fields, ` +
        `${invalidPeriodCount} with invalid period format, ` +
        `${invalidCountCount} with invalid count values. ` +
        `Check the columns and try again.`,
    );
  }

  await importDb.unsafe(
    `CREATE INDEX idx_staging_raw_run_${runId} ON ${names.raw} (data_id)`,
  );

  // Deduplication: MAX(count) when duplicates exist.
  await importDb.unsafe(`
  CREATE UNLOGGED TABLE ${names.dedup} AS
  SELECT
    facility_id,
    data_id,
    period_id,
    MAX(count) as count
  FROM ${names.raw}
  GROUP BY facility_id, data_id, period_id
  `);
  const dedupCount = await importDb<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM ${importDb(names.dedup)}
  `;
  await importDb.unsafe(`DROP TABLE ${names.raw}`);
  await importDb.unsafe(
    `CREATE INDEX idx_staging_dedup_run_${runId} ON ${names.dedup} (data_id)`,
  );

  onProgress(87);

  // Facility validation.
  const invalidFacilitiesSample = await importDb<
    { facility_id: string; row_count: number }[]
  >`
    SELECT t.facility_id, COUNT(*)::INTEGER as row_count
    FROM ${importDb(names.dedup)} t
    LEFT JOIN facilities_hmis f ON t.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
    GROUP BY t.facility_id
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `;
  const invalidFacilitiesTotal = await importDb<{ total_invalid: number }[]>`
    SELECT COUNT(DISTINCT t.facility_id)::INTEGER as total_invalid
    FROM ${importDb(names.dedup)} t
    LEFT JOIN facilities_hmis f ON t.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
  `;
  const rowsDroppedByFacility = await importDb<{ count: number }[]>`
    SELECT COUNT(*)::INTEGER as count
    FROM ${importDb(names.dedup)} t
    LEFT JOIN facilities_hmis f ON t.facility_id = f.facility_id
    WHERE f.facility_id IS NULL
  `;
  const facilityValidation = {
    total: invalidFacilitiesTotal[0]?.total_invalid || 0,
    sample: invalidFacilitiesSample,
    rowsDropped: rowsDroppedByFacility[0]?.count || 0,
  };

  await importDb.unsafe(`
    CREATE UNLOGGED TABLE ${names.validFacilities} AS
    SELECT t.*
    FROM ${names.dedup} t
    INNER JOIN facilities_hmis f ON t.facility_id = f.facility_id
  `);
  const validFacilityCount = await importDb<{ count: number }[]>`
    SELECT COUNT(*)::int as count FROM ${importDb(names.validFacilities)}
  `;
  const rowsAfterFacilityValidation = validFacilityCount[0]?.count || 0;
  await importDb.unsafe(`DROP TABLE ${names.dedup}`);

  onProgress(88);

  // The mapping: one row per value the wizard mapped, to its data id or
  // NULL for skipped. Every value the file says must be in it.
  await importDb.unsafe(`
    CREATE UNLOGGED TABLE ${names.mapping} (
      value TEXT PRIMARY KEY,
      data_id TEXT
    )
  `);
  const mappingEntries = Object.entries(mapping);
  if (mappingEntries.length > 0) {
    await importDb`
      INSERT INTO ${importDb(names.mapping)} (value, data_id)
      SELECT * FROM UNNEST(
        ${mappingEntries.map(([value]) => value)}::text[],
        ${mappingEntries.map(([, target]) => target)}::text[]
      )
    `;
  }
  const unmapped = await importDb<{ value: string }[]>`
    SELECT DISTINCT t.data_id AS value
    FROM ${importDb(names.validFacilities)} t
    LEFT JOIN ${importDb(names.mapping)} m ON m.value = t.data_id
    WHERE m.value IS NULL
    ORDER BY t.data_id
    LIMIT 10
  `;
  if (unmapped.length > 0) {
    throw new Error(
      `The file says values the mapping does not name: ${
        unmapped.map((r) => JSON.stringify(r.value)).join(", ")
      }. Start the import again.`,
    );
  }
  const skippedRows = await importDb<{ count: number }[]>`
    SELECT COUNT(*)::INTEGER as count
    FROM ${importDb(names.validFacilities)} t
    JOIN ${importDb(names.mapping)} m ON m.value = t.data_id
    WHERE m.data_id IS NULL
  `;
  const skippedByMapping = { rowsDropped: skippedRows[0]?.count || 0 };

  // Final staging table: rows land under the data id the mapping names.
  let finalStagingCount = 0;
  if (rowsAfterFacilityValidation > 0) {
    await importDb.unsafe(`
      CREATE UNLOGGED TABLE ${names.final} AS
      SELECT
        t.facility_id,
        m.data_id,
        t.period_id::INTEGER as period_id,
        t.count::INTEGER as count
      FROM ${names.validFacilities} t
      JOIN ${names.mapping} m ON m.value = t.data_id
      WHERE m.data_id IS NOT NULL
    `);
    const countRows = await importDb<{ count: number }[]>`
      SELECT COUNT(*)::int as count FROM ${importDb(names.final)}
    `;
    finalStagingCount = countRows[0]?.count || 0;
    if (finalStagingCount > 0) {
      await importDb.unsafe(
        `CREATE INDEX idx_staging_final_run_${runId} ON ${names.final} (facility_id, data_id, period_id)`,
      );
    }
  } else {
    await importDb.unsafe(`
      CREATE UNLOGGED TABLE ${names.final} (
        facility_id TEXT,
        data_id TEXT,
        period_id INTEGER,
        count INTEGER
      )
    `);
  }
  await importDb.unsafe(`DROP TABLE ${names.mapping}`);
  await importDb.unsafe(`DROP TABLE IF EXISTS ${names.validFacilities}`);

  onProgress(90);

  // Statistics from staged data.
  let periodIndicatorStats: PeriodIndicatorStat[] = [];
  if (finalStagingCount > 0) {
    const periodIndicatorStatsRaw = await importDb<
      {
        period_id: number;
        data_id: string;
        n_records: number;
        total_count: string | number;
      }[]
    >`
  SELECT
    period_id,
    data_id,
    COUNT(*)::int as n_records,
    SUM(count) as total_count
  FROM ${importDb(names.final)}
  GROUP BY period_id, data_id
  ORDER BY period_id, data_id
  `;
    periodIndicatorStats = periodIndicatorStatsRaw.map<PeriodIndicatorStat>(
      (stat) => ({
        periodId: stat.period_id,
        dataId: stat.data_id,
        nRecords: stat.n_records,
        totalCount: Number(stat.total_count),
      }),
    );
  }

  return {
    kind: "csv",
    dateImported,
    assetFileName: csvFileName,
    periodIndicatorStats,
    rawCsvRowCount: rowsProcessed,
    validCsvRowCount: rowsAfterCsvValidation,
    dedupedRowCount: dedupCount[0].count,
    finalStagingRowCount: finalStagingCount,
    validation: {
      invalidPeriods: { rowsDropped: invalidPeriodCount },
      invalidCounts: { rowsDropped: invalidCountCount },
      missingRequiredFields: { rowsDropped: missingFieldsCount },
      invalidFacilities: facilityValidation,
      skippedByMapping,
    },
  };
}
