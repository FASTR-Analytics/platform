# PLAN: DHIS2 Import — Scoped Delete-then-Insert (fix stale "phantom" values)

## Problem

After a DHIS2 import, values shown in the platform are **higher** than the same
figures in DHIS2. The import preview ("import meta info") shows the **correct**
(lower) numbers, but after integration the platform still shows the old higher
numbers.

This is not random: it is a structural consequence of how DHIS2 omits data and
how integration merges it.

## Root cause (verified in code)

The bug is a three-link chain. All three links are confirmed:

1. **DHIS2 analytics omits zero / never-reported cells.** The request only sets
   the `dx` / `pe` / `ou` dimensions plus `skipMeta` — there is no
   `includeZeroValues`
   ([get_analytics_from_dhis2.ts:65-119](server/dhis2/goal3_analytics/get_analytics_from_dhis2.ts#L65-L119)).
   DHIS2's analytics API does not return `0` (unless the data element is
   `zeroIsSignificant`) and never returns un-reported cells. So when a facility's
   value is corrected **down to 0**, or its data is **deleted/un-reported**
   upstream, DHIS2 returns **no row** for that `(facility, indicator, period)`.

2. **Staging only inserts the rows DHIS2 returned.** The staging worker iterates
   `response.rows` and inserts only those
   ([stage_hmis_data_dhis2/worker.ts:689-766](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L689-L766),
   insert at
   [worker.ts:337-346](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L337-L346)).
   There is **no full-grid seeding** — an omitted cell never enters the staging
   table.

3. **Integration is a pure per-cell merge (UPDATE + INSERT), never a delete.** It
   `UPDATE`s rows whose `(facility_id, indicator_raw_id, period_id)` match the
   staging table, then `INSERT`s the rest
   ([integrate_hmis_data/worker.ts:165-217](server/worker_routines/integrate_hmis_data/worker.ts#L165-L217)).
   A cell **absent from staging is never touched**, so its stale (higher) value
   survives.

### Why each symptom follows

| Symptom | Cause |
| --- | --- |
| Platform total **higher** than DHIS2 | Stale cells (now 0/deleted in DHIS2) are never overwritten and keep inflating the total. |
| Import meta shows **correct** numbers | `periodIndicatorStats.totalCount` sums only what DHIS2 returned = the correct current DHIS2 total ([worker.ts:354-368, 397-410](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L354-L410)). |
| After integration, **still higher** | The merge cannot zero/remove cells DHIS2 didn't send. |

Note: a value corrected *downward but still > 0* **is** returned by DHIS2 and
**is** overwritten correctly (the `UPDATE` blindly assigns `count = agg.count`,
no magnitude check — [worker.ts:165-175](server/worker_routines/integrate_hmis_data/worker.ts#L165-L175)).
The bug is specifically about cells that DHIS2 **drops** (0 / deleted /
un-reported).

## Fix

For **DHIS2 imports only**, replace the per-cell merge with a **scoped
delete-then-insert**: for every `(indicator, period)` work item that fetched
successfully, delete *all* existing rows for that pair from `dataset_hmis`, then
insert exactly what DHIS2 returned. CSV imports keep the existing merge.

### Why scoped delete-then-insert (not "seed zeros")

- **Space.** It keeps `dataset_hmis` **sparse**, mirroring DHIS2 itself. Seeding
  a `0` for every unreturned cell would bloat the table by
  `facilities × indicators × periods` (thousands × dozens × dozens = millions of
  junk rows).
- **Semantics.** In DHIS2, "absent" means *not reported*, which is **not** the
  same as "reported 0". Writing `0` fabricates a reported value; deletion
  correctly represents "no data".
- **Simplicity.** It *removes* a phase: instead of UPDATE → delete-matched →
  INSERT, it becomes DELETE-scope → INSERT. No `UPDATE` branch, no PK conflicts
  (the scope is cleared first).

### The load-bearing requirement: robust detection of a *successful empty return*

The delete is only safe if we can distinguish, per `(indicator, period)`:

- **Fetched successfully but DHIS2 returned nothing** → cells are legitimately
  gone → **delete is correct.**
- **Fetch failed** (network, 5xx, timeout, rate limit, oversized URL) → we know
  nothing about current state → **must NOT delete** (else a transient failure
  wipes good data to nothing).

This distinction is reliable in the current code, verified end-to-end:

- `getAnalyticsFromDHIS2` → `getDHIS2` → `fetchFromDHIS2` **throws** on any
  non-2xx response (`if (!response.ok) throw …`) and on timeout/abort
  ([base_fetcher.ts:118-145](server/dhis2/common/base_fetcher.ts#L118-L145)).
- `withRetry` retries network/5xx/429 up to `maxAttempts` (configured to **10**
  at the call site) and then **throws**; non-retryable 4xx throw immediately
  ([retry_utils.ts:47-86](server/dhis2/common/retry_utils.ts#L47-L86), call site
  [stage_hmis_data_dhis2/worker.ts:624-632](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L624-L632)).
- In `fetchIndicatorPeriod`, the whole facility-batch loop is inside one
  `try/catch`; any throw from any batch returns `{ success: false }`
  ([worker.ts:537-911](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L537-L911)).
  The oversized-URL guard also throws *before* fetching
  ([worker.ts:607-615](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L607-L615)).

**Therefore `result.success === true` ⟺ every facility batch for that
`(indicator, period)` returned HTTP 200.** A 200 with `rows: []` is a genuine
"DHIS2 has no data here" — exactly the case we must delete. This guarantee is the
foundation of the whole fix; the implementation below depends on it and on not
weakening it.

**What we currently DON'T record:** `periodIndicatorStats` is only populated when
at least one value is staged
([worker.ts:756-762](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L756-L762)),
so a *successful-but-empty* work item leaves **no trace** today. That empty case
is the entire point of the fix, so we must record successes explicitly (Step 2).

## Mechanical implementation

### Step 1 — Add an explicit succeeded-scope field to the staging result type

File: [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts), in
`DatasetDhis2StagingResult` (currently lines 210-232).

Add an **optional** field (optional = backward compatible with attempts staged by
old code; see Step 5 fallback):

```ts
export type DatasetDhis2StagingResult = {
  sourceType: "dhis2";
  dateImported: string;
  totalIndicatorPeriodCombos: number;
  successfulFetches: number;
  failedFetches: Array<{
    indicatorRawId: string;
    periodId: number;
    error: string;
  }>;
  periodIndicatorStats: PeriodIndicatorRawStat[];
  finalStagingRowCount: number;
  missingOrgUnits?: string[];
  // NEW: every (indicator, period) work item that fetched cleanly — including
  // those that returned zero rows. This is the authoritative delete scope for
  // integration. Absent (undefined) ⇒ staged by pre-fix code ⇒ fall back to
  // the legacy merge (no scoped delete).
  succeededWorkItems?: Array<{ indicatorRawId: string; periodId: number }>;
  workItemHistory: Array<{
    indicatorId: string;
    periodId: number;
    success: boolean;
    rowsStaged: number;
    facilityBatchesProcessed: number;
    completedAt: string;
    durationMs: number;
  }>;
};
```

No zod schema or migration is needed: `step_3_result` is plain `text`
([_main_database.sql:259](server/db/instance/_main_database.sql#L259)) and
`DatasetDhis2StagingResult` is a plain TS type with no validator.

### Step 2 — Record successes (incl. empties) in the staging worker

File: [stage_hmis_data_dhis2/worker.ts](server/worker_routines/stage_hmis_data_dhis2/worker.ts).

1. Declare an accumulator alongside the other run-level state (near lines
   207-214):

   ```ts
   const succeededWorkItems: Array<{ indicatorRawId: string; periodId: number }> = [];
   ```

2. In the `pooledMap` callback, in the **success** branch (currently lines
   304-316, where `completedWorkItems++` runs and `item` is in scope), push
   **unconditionally** (do *not* cap at 20 like `completedWorkItemHistory` —
   we need the complete set):

   ```ts
   if (result.success) {
     completedWorkItems++;
     succeededWorkItems.push({
       indicatorRawId: item.rawIndicatorId,
       periodId: item.periodId,
     });
     // ...existing completedWorkItemHistory push (still capped at 20)...
   }
   ```

   Concurrency is safe: `pooledMap` runs 5 work items concurrently but JS is
   single-threaded between `await`s; the existing code already mutates shared
   counters/arrays this way.

3. Include it in the `stagingResult` object written to `step_3_result`
   (currently lines 397-410):

   ```ts
   const stagingResult: DatasetDhis2StagingResult = {
     // ...existing fields...
     succeededWorkItems,
   };
   ```

That is the entire staging-side change. `success` is already the trustworthy
signal (see the guarantee above); we are only *persisting* it.

### Step 3 — Branch integration on source type and do scoped delete-then-insert

File: [integrate_hmis_data/worker.ts](server/worker_routines/integrate_hmis_data/worker.ts).

The worker already parses the staging result as the discriminated union
`DatasetStagingResult` (line 55), so `stagingResultRaw.sourceType` is available.
Keep **Phase 1/2/3** (validation, version id, version-record insert) unchanged.
Replace **Phase 4** (the UPDATE → delete-matched → INSERT block, lines 164-219)
with a source-type branch.

**DHIS2 branch** (when `stagingResultRaw.sourceType === "dhis2"` **and**
`succeededWorkItems` is present):

```ts
const succeeded = stagingResultRaw.succeededWorkItems ?? [];

// Two parallel arrays, same order, for a set-based UNNEST join.
const scopeIndicatorIds = succeeded.map((w) => w.indicatorRawId);
const scopePeriodIds = succeeded.map((w) => w.periodId);

// 1) Remove ALL existing rows in the successfully-fetched scope.
//    Pair-wise (indicator, period) match — NOT a cross product — so a pair that
//    failed to fetch is never deleted.
const deleteResult = await sql`
  DELETE FROM ${sql(datasetTableName)} dt
  USING UNNEST(
    ${scopeIndicatorIds}::text[],
    ${scopePeriodIds}::int[]
  ) AS s(indicator_raw_id, period_id)
  WHERE dt.indicator_raw_id = s.indicator_raw_id
    AND dt.period_id = s.period_id
`;
const rowsDeleted = deleteResult.count;

// 2) Insert exactly what DHIS2 returned. All staged rows belong to a succeeded
//    pair (failed work items stage nothing), and their scope was just cleared,
//    so no PK conflicts are possible. ON CONFLICT DO UPDATE is belt-and-braces
//    against DHIS2 returning the same org unit twice across batches.
const insertResult = await sql`
  INSERT INTO ${sql(datasetTableName)}
    (facility_id, indicator_raw_id, period_id, count, version_id)
  SELECT facility_id, indicator_raw_id, period_id, count, ${newVersionId}::INTEGER
  FROM ${sql(aggregatedTableName)}
  ON CONFLICT (facility_id, indicator_raw_id, period_id)
  DO UPDATE SET count = EXCLUDED.count, version_id = EXCLUDED.version_id
`;
const rowsInserted = insertResult.count;
```

Notes on the SQL:

- The `UNNEST(${arr}::text[], ${arr}::int[])` form binds each JS array as one
  Postgres array parameter (porsager `postgres`), giving a clean set-based join
  with no temp table and no row-count ceiling. Verify the array binding compiles
  (`deno task typecheck`) and, if the driver objects to inline casts, fall back
  to a `CREATE TEMP TABLE … ON COMMIT DROP` + insert + `DELETE … USING`.
- If `succeeded` is empty (every fetch failed), both `UNNEST` arrays are empty →
  the DELETE matches nothing and the INSERT inserts nothing (staging is empty
  too). Safe no-op.
- The delete is intentionally **all facilities** for each succeeded pair — that
  is what makes DHIS2 authoritative and removes the phantom cells.

**CSV branch** (`sourceType === "csv"`, or DHIS2 with `succeededWorkItems`
undefined — see Step 5): keep the **existing** UPDATE → delete-matched → INSERT
block verbatim. CSV semantics ("absent = keep prior value") are intended and must
not change.

### Step 4 — Version-record counts

The version record currently stores `n_rows_inserted` / `n_rows_updated` (updated
at lines 233-240). For the DHIS2 branch there is no "updated" count; map it as:

- `n_rows_inserted = rowsInserted`
- `n_rows_updated = rowsDeleted` (documented as "rows replaced/removed" for DHIS2)

Keep the CSV branch's existing `rowsUpdated` / `rowsInserted` semantics. This is a
reporting-only decision; pick the mapping and note it in a comment.

### Step 5 — Backward-compatible fallback

An upload attempt staged by **old** code (no `succeededWorkItems`) could be
integrated by **new** code (e.g. a half-finished import across a deploy). Guard:

```ts
const useScopedDelete =
  stagingResultRaw.sourceType === "dhis2" &&
  Array.isArray(stagingResultRaw.succeededWorkItems);
```

If `useScopedDelete` is false, run the **legacy merge** path. This degrades
*safely* (no deletes) rather than risking a wrongful wipe from missing scope
data.

## Edge cases

| Case | Behaviour | Correct? |
| --- | --- | --- |
| Cell value 100 → 0 / deleted in DHIS2 | Pair fetched OK, no row returned → existing row deleted | ✅ matches DHIS2 |
| Cell value 100 → 60 in DHIS2 | Row returned → deleted then re-inserted as 60 | ✅ |
| New cell (0 → 50) | Row returned → inserted | ✅ |
| Fetch for an `(indicator, period)` fails | Not in `succeededWorkItems` → **not** deleted, **not** inserted → prior value kept | ✅ no data loss |
| All fetches fail | Empty scope → no-op | ✅ |
| DHIS2 returns same OU twice across batches | `ON CONFLICT DO UPDATE` keeps last | ✅ defensive |
| Facility in `dataset_hmis` from CSV, same indicator+period as a DHIS2 import | Deleted by the DHIS2 import (see caveat) | ⚠️ see below |

## Behavioural caveat (call out before merge)

Scoped delete makes a DHIS2 import **authoritative for the entire
`indicator × period` scope it fetched** — it removes prior rows for *every*
facility in that scope, regardless of which source originally wrote them. For a
DHIS2 sync this is almost always the intended meaning, but it is a stronger
statement than the old merge. **Confirm that CSV and DHIS2 are not mixed within
the same indicator+period**, or this will delete CSV-origin rows on a DHIS2
import.

## Residual risks (and why they're acceptable / how to harden)

1. **HTTP 200 with a malformed body lacking `rows`.** Treated as a successful
   empty → would delete. Extremely unlikely (DHIS2 always returns a `rows`
   array). *Optional hardening:* in `fetchIndicatorPeriod`, treat a missing
   `rows`/`headers` field as a failure rather than empty.
2. **Silent org-unit truncation inside a 200 response.** If DHIS2 silently drops
   some requested OUs that had data, those cells get deleted and not re-inserted.
   Mitigated today by `FACILITY_BATCH_SIZE = 100` and the hard 2048-char URL
   guard ([worker.ts:607-615](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L607-L615));
   the existing `suspiciousBatches` analysis only logs. *Optional hardening:*
   promote a flagged suspicious batch to a work-item failure so the pair is
   excluded from the delete scope.
3. **`_SKIP_META = true`** disables missing-OU detection
   ([worker.ts:65](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L65)).
   This does **not** affect the delete approach: an OU absent from DHIS2 and an
   OU with no data both correctly resolve to "no row" = deleted. (Seeding zeros
   would have needed this distinction; delete does not.)

## Testing

> Server has no `--watch`; worker/lib changes require a manual server restart
> before they take effect.

1. `deno task typecheck` (covers both server and client; confirms the type change
   and the `UNNEST` array binding compile).
2. **Empirical, on a disposable instance** (query real rows, don't theorise):
   - Import an `(indicator, period)` with non-zero values for several facilities.
     Confirm rows in `dataset_hmis`.
   - In DHIS2, set one facility's value to 0 / delete it. Re-import the same
     scope.
   - **Expect:** that facility's row is **gone** from `dataset_hmis`; others
     updated to current values; the platform total now equals the DHIS2 total.
   - **Failure-path check:** point at an unreachable DHIS2 (or a period known to
     500) so a work item fails; confirm that pair's existing rows are **retained**
     (not deleted) and `failedFetches` is populated.
3. **CSV regression:** run a CSV import that omits a previously-present cell;
   confirm the old value is **kept** (merge unchanged).
4. Sanity-check `dataset_hmis_versions` counts (`n_rows_inserted`,
   `n_rows_updated`/deleted) against the actual delta.

## Out of scope (observed, not fixed here)

- Several status `UPDATE`s on `dataset_hmis_upload_attempts` run with **no
  `WHERE` clause** (e.g. integration "mark complete" at
  [integrate_hmis_data/worker.ts:264-269](server/worker_routines/integrate_hmis_data/worker.ts#L264-L269)).
  Currently masked by the single-active-attempt lock
  ([dataset_hmis.ts:924-942](server/db/instance/dataset_hmis.ts#L924-L942)).
  Note only.
- The single fixed staging table name
  ([integrate_hmis_data/worker.ts:39](server/worker_routines/integrate_hmis_data/worker.ts#L39))
  and broader importer consolidation — see
  [PLAN_DATA_IMPORT_ARCHITECTURE.md](PLAN_DATA_IMPORT_ARCHITECTURE.md) /
  [PLAN_IMPORTER_CONSOLIDATION.md](PLAN_IMPORTER_CONSOLIDATION.md).

## Rollback

Single-commit revert. No schema migration, no data backfill. Attempts staged
with `succeededWorkItems` simply have an unused field; integration falls back to
the legacy merge once the new branch is reverted.

## File-change summary

| File | Change |
| --- | --- |
| [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) | Add optional `succeededWorkItems` to `DatasetDhis2StagingResult` |
| [stage_hmis_data_dhis2/worker.ts](server/worker_routines/stage_hmis_data_dhis2/worker.ts) | Accumulate succeeded `(indicator, period)` pairs (incl. empties); write to `step_3_result` |
| [integrate_hmis_data/worker.ts](server/worker_routines/integrate_hmis_data/worker.ts) | Branch on `sourceType`; DHIS2 → scoped delete-then-insert; CSV → unchanged; fallback when scope absent; version-count mapping |
