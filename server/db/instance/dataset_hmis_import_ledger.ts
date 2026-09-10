import { Sql } from "postgres";
import {
  APIResponseWithData,
  type DatasetHmisImportLedgerItem,
  type DatasetHmisLedgerSkippedValue,
  type Dhis2FetchErrorKind,
  parseJsonOrThrow,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

type LedgerPair = { indicatorRawId: string; periodId: number };

// What an import writes per pair. `skipped` is DHIS2 only: the facility
// values left out of the pair as not non-negative integers, with a capped
// sample. CSV integration passes none (a bad CSV count is dropped and
// counted at staging), which records 0.
export type LedgerPairWrite = LedgerPair & {
  skipped?: { values: number; sample: DatasetHmisLedgerSkippedValue[] };
};

function dedupePairs<T extends LedgerPair>(pairs: T[]): T[] {
  const map = new Map<string, T>();
  for (const p of pairs) {
    map.set(`${p.indicatorRawId}|${p.periodId}`, p);
  }
  return Array.from(map.values());
}

// Recompute-and-upsert for pairs an import just touched. Counts come from
// dataset_hmis itself (not from staged stats), so the ledger row equals the
// data even when rows outside the import's facility scope survive a scoped
// delete. Must run inside the integration transaction.
export async function upsertHmisLedgerPairsFromData(
  sql: Sql,
  pairs: LedgerPairWrite[],
  source: "dhis2" | "csv",
  versionId: number,
): Promise<void> {
  const deduped = dedupePairs(pairs);
  if (deduped.length === 0) {
    return;
  }
  const indicatorIds = deduped.map((p) => p.indicatorRawId);
  const periodIds = deduped.map((p) => p.periodId);
  const skippedValues = deduped.map((p) => p.skipped?.values ?? 0);
  const skippedSamples = deduped.map((p) =>
    JSON.stringify(p.skipped?.sample ?? [])
  );
  // The indicators_raw JOIN skips pairs whose indicator was deleted between
  // staging and integration (possible for pairs with no dataset_hmis rows:
  // deleteIndicatorRaw only refuses when data exists). Without it the FK
  // aborts the whole integration; skipping matches what ON DELETE CASCADE
  // would have produced had the delete come after this write.
  await sql`
    INSERT INTO dataset_hmis_import_ledger
      (indicator_raw_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
       source, status, error, imported_at, version_id)
    SELECT s.indicator_raw_id, s.period_id, agg.n, agg.sum, s.skipped_values, s.skipped_values_sample,
      ${source}, 'ready', NULL, now(), ${versionId}
    FROM UNNEST(
      ${indicatorIds}::text[], ${periodIds}::int[], ${skippedValues}::int[], ${skippedSamples}::text[]
    ) AS s(indicator_raw_id, period_id, skipped_values, skipped_values_sample)
    JOIN indicators_raw ir ON ir.indicator_raw_id = s.indicator_raw_id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS n, COALESCE(SUM(dt.count), 0)::bigint AS sum
      FROM dataset_hmis dt
      WHERE dt.indicator_raw_id = s.indicator_raw_id AND dt.period_id = s.period_id
    ) agg
    ON CONFLICT (indicator_raw_id, period_id) DO UPDATE SET
      n_records = EXCLUDED.n_records,
      sum_count = EXCLUDED.sum_count,
      skipped_values = EXCLUDED.skipped_values,
      skipped_values_sample = EXCLUDED.skipped_values_sample,
      source = EXCLUDED.source,
      status = 'ready',
      error = NULL,
      imported_at = EXCLUDED.imported_at,
      version_id = EXCLUDED.version_id
  `;
}

// Failed DHIS2 pairs: record the failure without touching the last
// data-bearing counts / imported_at / source (no data changed). A pair that
// has never imported gets a zero-count 'error' row (imported_at NULL).
export async function upsertHmisLedgerErrorPairs(
  sql: Sql,
  failures: Array<{
    indicatorRawId: string;
    periodId: number;
    error: string;
    errorKind?: Dhis2FetchErrorKind;
  }>,
): Promise<void> {
  const deduped = dedupePairs(failures);
  if (deduped.length === 0) {
    return;
  }
  const indicatorIds = deduped.map((f) => f.indicatorRawId);
  const periodIds = deduped.map((f) => f.periodId);
  const errors = deduped.map((f) =>
    `[${f.errorKind ?? "transient"}] ${f.error}`.slice(0, 1000)
  );
  // indicators_raw JOIN: same deleted-mid-wizard guard as
  // upsertHmisLedgerPairsFromData above.
  await sql`
    INSERT INTO dataset_hmis_import_ledger
      (indicator_raw_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
       source, status, error, imported_at, version_id)
    SELECT s.indicator_raw_id, s.period_id, 0, 0, 0, '[]', 'dhis2', 'error', s.error, NULL, NULL
    FROM UNNEST(${indicatorIds}::text[], ${periodIds}::int[], ${errors}::text[])
      AS s(indicator_raw_id, period_id, error)
    JOIN indicators_raw ir ON ir.indicator_raw_id = s.indicator_raw_id
    ON CONFLICT (indicator_raw_id, period_id) DO UPDATE SET
      status = 'error',
      error = EXCLUDED.error
  `;
}

// After a windowed/full deletion: re-count the affected pairs; pairs left with
// no data lose their ledger row, surviving pairs keep their last-import
// identity (source/imported_at/status) with corrected counts. Must run inside
// the deletion transaction.
export async function reconcileHmisLedgerPairsAfterDelete(
  sql: Sql,
  pairs: LedgerPair[],
): Promise<void> {
  const deduped = dedupePairs(pairs);
  if (deduped.length === 0) {
    return;
  }
  const indicatorIds = deduped.map((p) => p.indicatorRawId);
  const periodIds = deduped.map((p) => p.periodId);
  await sql`
    UPDATE dataset_hmis_import_ledger l
    SET n_records = agg.n, sum_count = agg.sum
    FROM UNNEST(${indicatorIds}::text[], ${periodIds}::int[]) AS s(indicator_raw_id, period_id)
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS n, COALESCE(SUM(dt.count), 0)::bigint AS sum
      FROM dataset_hmis dt
      WHERE dt.indicator_raw_id = s.indicator_raw_id AND dt.period_id = s.period_id
    ) agg
    WHERE l.indicator_raw_id = s.indicator_raw_id
      AND l.period_id = s.period_id
      AND agg.n > 0
  `;
  await sql`
    DELETE FROM dataset_hmis_import_ledger l
    USING UNNEST(${indicatorIds}::text[], ${periodIds}::int[]) AS s(indicator_raw_id, period_id)
    WHERE l.indicator_raw_id = s.indicator_raw_id
      AND l.period_id = s.period_id
      AND NOT EXISTS (
        SELECT 1 FROM dataset_hmis dt
        WHERE dt.indicator_raw_id = l.indicator_raw_id AND dt.period_id = l.period_id
      )
  `;
}

export async function getDatasetHmisImportLedgerItems(
  mainDb: Sql,
): Promise<APIResponseWithData<DatasetHmisImportLedgerItem[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
      {
        indicator_raw_id: string;
        period_id: number;
        n_records: number;
        sum_count: string | number;
        skipped_values: number;
        skipped_values_sample: string;
        source: "dhis2" | "csv" | "backfill";
        status: "ready" | "error";
        error: string | null;
        imported_at: string | Date | null;
        version_id: number | null;
      }[]
    >`
      SELECT indicator_raw_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
        source, status, error, imported_at, version_id
      FROM dataset_hmis_import_ledger
      ORDER BY indicator_raw_id, period_id
    `;
    const data = rows.map<DatasetHmisImportLedgerItem>((r) => ({
      indicatorRawId: r.indicator_raw_id,
      periodId: r.period_id,
      nRecords: r.n_records,
      sumCount: Number(r.sum_count),
      skippedValues: r.skipped_values,
      skippedValuesSample: parseJsonOrThrow<DatasetHmisLedgerSkippedValue[]>(
        r.skipped_values_sample,
      ),
      source: r.source,
      status: r.status,
      error: r.error ?? undefined,
      importedAt: r.imported_at
        ? new Date(r.imported_at).toISOString()
        : undefined,
      versionId: r.version_id ?? undefined,
    }));
    return { success: true, data };
  });
}
