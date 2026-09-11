import { Sql } from "postgres";
import {
  APIResponseWithData,
  type DatasetHmisImportLedgerItem,
  type DatasetHmisLedgerSkippedValue,
  type Dhis2FetchErrorKind,
  parseJsonOrThrow,
} from "lib";
import { tryCatchDatabaseAsync } from "../utils.ts";

type LedgerPair = { sourceId: string; periodId: number };

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
    map.set(`${p.sourceId}|${p.periodId}`, p);
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
  const sourceIds = deduped.map((p) => p.sourceId);
  const periodIds = deduped.map((p) => p.periodId);
  const skippedValues = deduped.map((p) => p.skipped?.values ?? 0);
  const skippedSamples = deduped.map((p) =>
    JSON.stringify(p.skipped?.sample ?? [])
  );
  // The indicator_sources JOIN skips pairs whose source was deleted between
  // staging and integration (possible for pairs with no dataset_hmis rows:
  // deleting an indicator only refuses when its sources have data). Without
  // it the FK aborts the whole integration; skipping matches what ON DELETE
  // CASCADE would have produced had the delete come after this write.
  await sql`
    INSERT INTO dataset_hmis_import_ledger
      (source_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
       source, status, error, imported_at, version_id)
    SELECT s.source_id, s.period_id, agg.n, agg.sum, s.skipped_values, s.skipped_values_sample,
      ${source}, 'ready', NULL, now(), ${versionId}
    FROM UNNEST(
      ${sourceIds}::text[], ${periodIds}::int[], ${skippedValues}::int[], ${skippedSamples}::text[]
    ) AS s(source_id, period_id, skipped_values, skipped_values_sample)
    JOIN indicator_sources src ON src.source_id = s.source_id
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS n, COALESCE(SUM(dt.count), 0)::bigint AS sum
      FROM dataset_hmis dt
      WHERE dt.source_id = s.source_id AND dt.period_id = s.period_id
    ) agg
    ON CONFLICT (source_id, period_id) DO UPDATE SET
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
    sourceId: string;
    periodId: number;
    error: string;
    errorKind?: Dhis2FetchErrorKind;
  }>,
): Promise<void> {
  const deduped = dedupePairs(failures);
  if (deduped.length === 0) {
    return;
  }
  const sourceIds = deduped.map((f) => f.sourceId);
  const periodIds = deduped.map((f) => f.periodId);
  const errors = deduped.map((f) =>
    `[${f.errorKind ?? "transient"}] ${f.error}`.slice(0, 1000)
  );
  // indicator_sources JOIN: same deleted-mid-wizard guard as
  // upsertHmisLedgerPairsFromData above.
  await sql`
    INSERT INTO dataset_hmis_import_ledger
      (source_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
       source, status, error, imported_at, version_id)
    SELECT s.source_id, s.period_id, 0, 0, 0, '[]', 'dhis2', 'error', s.error, NULL, NULL
    FROM UNNEST(${sourceIds}::text[], ${periodIds}::int[], ${errors}::text[])
      AS s(source_id, period_id, error)
    JOIN indicator_sources src ON src.source_id = s.source_id
    ON CONFLICT (source_id, period_id) DO UPDATE SET
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
  const sourceIds = deduped.map((p) => p.sourceId);
  const periodIds = deduped.map((p) => p.periodId);
  await sql`
    UPDATE dataset_hmis_import_ledger l
    SET n_records = agg.n, sum_count = agg.sum
    FROM UNNEST(${sourceIds}::text[], ${periodIds}::int[]) AS s(source_id, period_id)
    CROSS JOIN LATERAL (
      SELECT COUNT(*)::integer AS n, COALESCE(SUM(dt.count), 0)::bigint AS sum
      FROM dataset_hmis dt
      WHERE dt.source_id = s.source_id AND dt.period_id = s.period_id
    ) agg
    WHERE l.source_id = s.source_id
      AND l.period_id = s.period_id
      AND agg.n > 0
  `;
  await sql`
    DELETE FROM dataset_hmis_import_ledger l
    USING UNNEST(${sourceIds}::text[], ${periodIds}::int[]) AS s(source_id, period_id)
    WHERE l.source_id = s.source_id
      AND l.period_id = s.period_id
      AND NOT EXISTS (
        SELECT 1 FROM dataset_hmis dt
        WHERE dt.source_id = l.source_id AND dt.period_id = l.period_id
      )
  `;
}

export async function getDatasetHmisImportLedgerItems(
  mainDb: Sql,
): Promise<APIResponseWithData<DatasetHmisImportLedgerItem[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rows = await mainDb<
      {
        source_id: string;
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
      SELECT source_id, period_id, n_records, sum_count, skipped_values, skipped_values_sample,
        source, status, error, imported_at, version_id
      FROM dataset_hmis_import_ledger
      ORDER BY source_id, period_id
    `;
    const data = rows.map<DatasetHmisImportLedgerItem>((r) => ({
      sourceId: r.source_id,
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
