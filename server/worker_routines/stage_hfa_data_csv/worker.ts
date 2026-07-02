import { Sql } from "postgres";
import {
  UPLOADED_HFA_DATA_STAGING_TABLE_NAME,
  UPLOADED_HFA_DICT_VALUES_STAGING_TABLE_NAME,
  UPLOADED_HFA_DICT_VARS_STAGING_TABLE_NAME,
} from "../../exposed_env_vars.ts";
import {
  DBDatasetHfaUploadAttempt,
  createBulkImportConnection,
  createWorkerReadConnection,
  escapeSqlString,
} from "../../db/mod.ts";
import {
  parseJsonOrThrow,
  throwIfErrWithData,
  type DatasetHfaStep1Result,
} from "lib";
import {
  DatasetHfaCsvStagingResult,
  DatasetHfaUploadAttemptStatus,
  HfaCsvMappingParams,
} from "lib";
import {
  getCsvColumnIndex,
  getCsvStreamComponents,
} from "../../server_only_funcs_csvs/get_csv_components_streaming_fast.ts";
import {
  parseXlsForm,
  type XlsFormChoiceInfo,
  type XlsFormVarInfo,
} from "../../server_only_funcs_csvs/parse_xlsform.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("Worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

let alreadyRunning = false;

const DICT_VARS_STAGING_TABLE = UPLOADED_HFA_DICT_VARS_STAGING_TABLE_NAME;
const DICT_VALUES_STAGING_TABLE = UPLOADED_HFA_DICT_VALUES_STAGING_TABLE_NAME;

async function run(std: { rawDUA: DBDatasetHfaUploadAttempt }) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { rawDUA } = std;

  const tempTableName = "uploaded_data_staging_raw_hfa";
  const stagingTableName = UPLOADED_HFA_DATA_STAGING_TABLE_NAME;
  const tempValidFacilitiesTable = "temp_valid_facilities_hfa";

  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  try {
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // Parse step 1 result (now contains both CSV and XLSForm info)
    const step1Result = parseJsonOrThrow<DatasetHfaStep1Result>(
      rawDUA.step_1_result,
    );
    const assetFilePath = step1Result.csv.filePath;
    const mappings = parseJsonOrThrow<HfaCsvMappingParams>(
      rawDUA.step_2_result,
    );

    const timePoint = mappings.timePoint;

    // Parse XLSForm
    const xlsForm = parseXlsForm(step1Result.xlsForm.filePath);

    // Get streaming components
    const resComponents = await getCsvStreamComponents(
      assetFilePath,
      "allow-fewer-columns",
    );
    throwIfErrWithData(resComponents);
    const { headers, encodedHeaderToIndexMap, processRows } =
      resComponents.data;

    // Get facility_id column index from mappings
    const facilityIdIndex = getCsvColumnIndex(
      encodedHeaderToIndexMap,
      { facility_id: mappings.facilityIdColumn },
      "facility_id",
    );

    // Match CSV columns to XLSForm vars (with group prefix stripping)
    type CsvVarMapping = {
      csvHeader: string;
      csvIndex: number;
      xlsFormVar: XlsFormVarInfo;
      choices?: XlsFormChoiceInfo[];
    };

    const csvVarMappings: CsvVarMapping[] = [];
    const unmatchedCsvCols: string[] = [];

    for (let i = 0; i < headers.length; i++) {
      if (i === facilityIdIndex) continue;
      const csvHeader = headers[i];
      // Strip group prefix: "section_a/subsection/var_name" → "var_name"
      const localName = csvHeader.includes("/")
        ? csvHeader.substring(csvHeader.lastIndexOf("/") + 1)
        : csvHeader;

      const xlsVar = xlsForm.vars.get(localName);
      if (!xlsVar) {
        unmatchedCsvCols.push(csvHeader);
        continue;
      }

      // Only include select_one, select_multiple, integer, decimal
      if (
        xlsVar.type !== "select_one" &&
        xlsVar.type !== "select_multiple" &&
        xlsVar.type !== "integer" &&
        xlsVar.type !== "decimal"
      ) {
        continue;
      }

      const mapping: CsvVarMapping = {
        csvHeader,
        csvIndex: i,
        xlsFormVar: xlsVar,
      };

      if (
        (xlsVar.type === "select_one" || xlsVar.type === "select_multiple") &&
        xlsVar.listName
      ) {
        mapping.choices = xlsForm.choiceLists.get(xlsVar.listName);
      }

      csvVarMappings.push(mapping);
    }

    // "weight" is reserved: the project hfa.csv export adds a sampling-weight
    // column with that name, and a survey variable named weight would collide
    // with it at the module script's pivot_wider.
    const storedVarNames = csvVarMappings.flatMap((m) => {
      const varName = m.xlsFormVar.name.trim();
      if (m.xlsFormVar.type === "select_multiple") {
        return (m.choices ?? []).map(
          (choice) => `${varName}_${String(choice.name).trim()}`,
        );
      }
      return [varName];
    });
    const weightCollisions = storedVarNames.filter(
      (name) => name.toLowerCase() === "weight",
    );
    if (weightCollisions.length > 0) {
      throw new Error(
        `The variable name "weight" is reserved for facility sampling weights. Rename the survey variable in the XLSForm/CSV and re-upload.`,
      );
    }

    const nCsvColsNotInXlsForm = unmatchedCsvCols.length;

    // Count XLSForm vars not in CSV (informational)
    const csvLocalNames = new Set(
      csvVarMappings.map((m) => m.xlsFormVar.name),
    );
    let nXlsFormVarsNotInCsv = 0;
    for (const [name] of xlsForm.vars) {
      if (!csvLocalNames.has(name)) nXlsFormVarsNotInCsv++;
    }

    const nSelectMultipleExpanded = csvVarMappings.filter(
      (m) => m.xlsFormVar.type === "select_multiple",
    ).length;

    const dateImported = new Date().toISOString();

    const fileInfo = await Deno.stat(assetFilePath);
    const fileSizeBytes = fileInfo.size;
    let lastProgressUpdate = 1;

    // Clean up any existing temp/staging tables
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${DICT_VARS_STAGING_TABLE}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${DICT_VALUES_STAGING_TABLE}`);

    await updateImportProgress(mainDb, 1);

    // Create temp table for HFA data
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${tempTableName} (
  facility_id TEXT NOT NULL,
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL
)`);

    // Prepare for bulk insert
    let rowBuffer: string[] = [];
    const BUFFER_SIZE = 100000;
    let totalRows = 0;
    let rowsProcessed = 0;
    let invalidRows = 0;
    let missingFacilityIdCount = 0;
    let duplicateRowsCount = 0;
    const seenFacilities = new Set<string>();
    const cleanedTimePoint = timePoint.trim();

    // Values are kept verbatim (only trimmed); escaping happens exactly once,
    // when the SQL VALUES tuple is built
    const tup = (...vals: string[]) =>
      `(${vals.map((v) => `'${escapeSqlString(v)}'`).join(",")})`;

    const flushBuffer = async () => {
      if (rowBuffer.length === 0) return;
      const insertQuery = `INSERT INTO ${tempTableName} (facility_id, time_point, var_name, value) VALUES ${rowBuffer.join(",")}`;
      await importDb.unsafe(insertQuery);
      rowBuffer = [];
    };

    // Process CSV rows — wide to long, with select_multiple expansion
    await processRows(
      async (row: string[], _rowIndex: number, bytesRead: number) => {
        totalRows++;

        const facilityIdRaw = row[facilityIdIndex];

        if (!facilityIdRaw) {
          missingFacilityIdCount++;
          invalidRows++;
          return;
        }

        const facilityId = facilityIdRaw.trim();
        if (!facilityId) {
          missingFacilityIdCount++;
          invalidRows++;
          return;
        }

        if (seenFacilities.has(facilityId)) {
          duplicateRowsCount++;
          invalidRows++;
          return;
        }
        seenFacilities.add(facilityId);

        rowsProcessed++;

        for (const mapping of csvVarMappings) {
          const valueRaw = row[mapping.csvIndex] || "";
          const value = valueRaw.trim();

          if (
            mapping.xlsFormVar.type === "select_multiple" &&
            mapping.choices
          ) {
            // Expand to binary variables
            const selectedCodes = new Set(
              value ? value.split(" ").filter((s) => s.length > 0) : [],
            );
            for (const choice of mapping.choices) {
              const expandedVarName = `${mapping.xlsFormVar.name.trim()}_${String(choice.name).trim()}`;
              const binaryValue = selectedCodes.has(String(choice.name))
                ? "1"
                : "0";
              rowBuffer.push(
                tup(facilityId, cleanedTimePoint, expandedVarName, binaryValue),
              );
            }
          } else {
            // Regular variable
            rowBuffer.push(
              tup(
                facilityId,
                cleanedTimePoint,
                mapping.xlsFormVar.name.trim(),
                value,
              ),
            );
          }
        }

        if (rowBuffer.length >= BUFFER_SIZE) {
          await flushBuffer();
          const progress = Math.floor((bytesRead / fileSizeBytes) * 84) + 1;
          if (progress > lastProgressUpdate) {
            await updateImportProgress(mainDb, progress);
            lastProgressUpdate = progress;
          }
        }
      },
    );

    await flushBuffer();

    await updateImportProgress(mainDb, 88);

    // Validate facilities
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${tempValidFacilitiesTable} AS
SELECT DISTINCT facility_id FROM facilities_hfa
WHERE EXISTS (
  SELECT 1 FROM ${tempTableName} t
  WHERE t.facility_id = facilities_hfa.facility_id
)`);

    await updateImportProgress(mainDb, 90);

    // Create final staging table with validated facilities
    await importDb.unsafe(`
CREATE TABLE ${stagingTableName} AS
SELECT
  t.facility_id,
  t.time_point,
  t.var_name,
  t.value
FROM ${tempTableName} t
WHERE EXISTS (
  SELECT 1 FROM ${tempValidFacilitiesTable} vf
  WHERE vf.facility_id = t.facility_id
)`);

    await importDb.unsafe(`
ALTER TABLE ${stagingTableName}
ADD PRIMARY KEY (facility_id, time_point, var_name)`);

    await updateImportProgress(mainDb, 93);

    // Create and populate dictionary staging tables
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${DICT_VARS_STAGING_TABLE} (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  var_label TEXT NOT NULL,
  var_type TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name)
)`);
    await importDb.unsafe(`
CREATE UNLOGGED TABLE ${DICT_VALUES_STAGING_TABLE} (
  time_point TEXT NOT NULL,
  var_name TEXT NOT NULL,
  value TEXT NOT NULL,
  value_label TEXT NOT NULL,
  PRIMARY KEY (time_point, var_name, value)
)`);

    const dictVarRows: string[] = [];
    const dictValueRows: string[] = [];

    for (const mapping of csvVarMappings) {
      const varName = mapping.xlsFormVar.name.trim();
      const varLabel = mapping.xlsFormVar.label.trim();
      const varType = mapping.xlsFormVar.type;

      if (mapping.xlsFormVar.type === "select_multiple" && mapping.choices) {
        for (const choice of mapping.choices) {
          const expandedVarName = `${varName}_${String(choice.name).trim()}`;
          const compositeLabel =
            `${mapping.xlsFormVar.label} - ${choice.label}`.trim();
          dictVarRows.push(
            tup(
              cleanedTimePoint,
              expandedVarName,
              compositeLabel,
              "select_multiple_binary",
            ),
          );
          dictValueRows.push(tup(cleanedTimePoint, expandedVarName, "1", "Yes"));
          dictValueRows.push(tup(cleanedTimePoint, expandedVarName, "0", "No"));
        }
      } else if (
        mapping.xlsFormVar.type === "select_one" &&
        mapping.choices
      ) {
        dictVarRows.push(tup(cleanedTimePoint, varName, varLabel, varType));
        for (const choice of mapping.choices) {
          dictValueRows.push(
            tup(
              cleanedTimePoint,
              varName,
              String(choice.name).trim(),
              choice.label.trim(),
            ),
          );
        }
      } else {
        dictVarRows.push(tup(cleanedTimePoint, varName, varLabel, varType));
      }
    }

    if (dictVarRows.length > 0) {
      // Insert in batches
      for (let i = 0; i < dictVarRows.length; i += 1000) {
        const batch = dictVarRows.slice(i, i + 1000);
        await importDb.unsafe(
          `INSERT INTO ${DICT_VARS_STAGING_TABLE} (time_point, var_name, var_label, var_type) VALUES ${batch.join(",")}`,
        );
      }
    }
    if (dictValueRows.length > 0) {
      for (let i = 0; i < dictValueRows.length; i += 1000) {
        const batch = dictValueRows.slice(i, i + 1000);
        await importDb.unsafe(
          `INSERT INTO ${DICT_VALUES_STAGING_TABLE} (time_point, var_name, value, value_label) VALUES ${batch.join(",")}`,
        );
      }
    }

    await updateImportProgress(mainDb, 95);

    // Get statistics
    const validRowCount = (
      await importDb<{ count: number }[]>`
SELECT COUNT(*)::int as count FROM ${importDb.unsafe(stagingTableName)}`
    )[0].count;

    const invalidFacilityNotFoundCount = (
      await importDb<{ count: number }[]>`
SELECT COUNT(DISTINCT facility_id)::int as count
FROM ${importDb.unsafe(tempTableName)}
WHERE NOT EXISTS (
  SELECT 1 FROM ${importDb.unsafe(tempValidFacilitiesTable)} vf
  WHERE vf.facility_id = ${importDb.unsafe(tempTableName)}.facility_id
)`
    )[0].count;

    // Clean up temp tables (keep staging tables for integration worker)
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
    await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);

    const result: DatasetHfaCsvStagingResult = {
      stagingTableName,
      dictionaryVarsStagingTableName: DICT_VARS_STAGING_TABLE,
      dictionaryValuesStagingTableName: DICT_VALUES_STAGING_TABLE,
      dateImported,
      assetFileName: step1Result.csv.fileName,
      nRowsInFile: totalRows,
      nRowsValid: rowsProcessed - invalidFacilityNotFoundCount,
      nRowsInvalidMissingFacilityId: missingFacilityIdCount,
      nRowsInvalidFacilityNotFound: invalidFacilityNotFoundCount,
      nRowsDuplicated: duplicateRowsCount,
      nRowsTotal: validRowCount,
      timePoint,
      nDictionaryVars: dictVarRows.length,
      nDictionaryValues: dictValueRows.length,
      nXlsFormVarsNotInCsv,
      nCsvColsNotInXlsForm,
      nSelectMultipleExpanded,
    };

    await updateImportProgress(mainDb, 100, result);

    await mainDb`
UPDATE hfa_upload_attempts
SET
  step = 4,
  step_3_result = ${JSON.stringify(result)},
  status = ${JSON.stringify({ status: "staged", result })},
  status_type = 'staged'
`;

    (self as unknown as Worker).postMessage("COMPLETED");
  } catch (error) {
    console.error("Error in staging worker:", error);

    try {
      await mainDb`
UPDATE hfa_upload_attempts
SET
  status = ${JSON.stringify({
    status: "error",
    err: error instanceof Error ? error.message : String(error),
  })},
  status_type = 'error'
`;
    } catch (dbError) {
      console.error("Failed to update error status:", dbError);
    }

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${tempTableName}`);
      await importDb.unsafe(`DROP TABLE IF EXISTS ${tempValidFacilitiesTable}`);
      await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
      await importDb.unsafe(`DROP TABLE IF EXISTS ${DICT_VARS_STAGING_TABLE}`);
      await importDb.unsafe(
        `DROP TABLE IF EXISTS ${DICT_VALUES_STAGING_TABLE}`,
      );
    } catch (cleanupError) {
      console.error("Failed to clean up staging tables:", cleanupError);
    }

    throw error;
  } finally {
    // Connection teardown only — never self.close() here: closing before the
    // rethrown error reaches the preamble's reportError discards it, so the
    // host's error listener never fires and the worker slot is stranded.
    await importDb.end();
    await mainDb.end();
  }
}

async function updateImportProgress(
  mainDb: Sql,
  progress: number,
  result?: DatasetHfaCsvStagingResult,
) {
  const status: DatasetHfaUploadAttemptStatus = result
    ? { status: "staged", result }
    : { status: "staging", progress };

  await mainDb`
UPDATE hfa_upload_attempts
SET
  status = ${JSON.stringify(status)},
  status_type = ${result ? "staged" : "staging"}
`;
}
