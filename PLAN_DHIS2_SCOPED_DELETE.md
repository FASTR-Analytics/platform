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
  ([worker.ts:506-856](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L506-L856)).
  The oversized-URL guard also throws *before* fetching
  ([worker.ts:576-584](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L576-L584)).

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

**Verified exhaustively (2026-07-01):** every transport-failure class — DNS /
connection / TLS errors, timeouts (including a stalled body read, since
`AbortController`'s signal covers the whole fetch lifecycle, not just connection
setup), any non-2xx status, retry exhaustion, and a malformed/non-JSON response
body — is traced through **exactly one** `try/catch` in `fetchIndicatorPeriod`
([worker.ts:506-856](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L506-L856))
with **no** inner `try/catch` that could swallow an error, and becomes
`success: false`. Exactly **one** gap exists: a response that is valid JSON and
HTTP 200 but is missing the `rows` field entirely (a shape violation, not a
network failure) is currently silently treated as "zero data" rather than
"untrustworthy," at the guard in
[worker.ts:658](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L658)
(`if (response.rows && response.rows.length > 0)`). Step 2 closes this — the only
change needed to make the transport-error guarantee complete.

## Mechanical implementation

### Step 1 — Add explicit succeeded-scope and fetched-facility-scope fields to the staging result type

File: [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts), in
`DatasetDhis2StagingResult` (currently lines 210-232).

Add two **optional** fields (optional = backward compatible with attempts staged
by old code; see Step 5 fallback):

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
  // those that returned zero rows. Paired with fetchedFacilityIds below, this
  // is the authoritative delete scope for integration. Absent (undefined) ⇒
  // staged by pre-fix code ⇒ fall back to the legacy merge (no scoped delete).
  succeededWorkItems?: Array<{ indicatorRawId: string; periodId: number }>;
  // NEW: the exact facility_id set queried against DHIS2 at staging time (one
  // list, reused for every work item — see Step 2). Integration deletes against
  // this literal snapshot rather than re-deriving "which facilities count" from
  // a regex at a later point in time, so delete-scope == fetch-scope by
  // construction — no separate correctness argument needed.
  fetchedFacilityIds?: string[];
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
([_main_database.sql:334](server/db/instance/_main_database.sql#L334)) and
`DatasetDhis2StagingResult` is a plain TS type with no validator.

Size note: `fetchedFacilityIds` is a few thousand ~11-character strings (tens of
KB as JSON) — comparable to other fields already stored in this text column and
copied into `dataset_hmis_versions.staging_result`; no special handling needed.

### Step 2 — Record successes, snapshot the facility scope, and close the one response-shape gap

File: [stage_hmis_data_dhis2/worker.ts](server/worker_routines/stage_hmis_data_dhis2/worker.ts).

1. Declare an accumulator alongside the other run-level state (near lines
   176-183):

   ```ts
   const succeededWorkItems: Array<{ indicatorRawId: string; periodId: number }> = [];
   ```

2. In the `pooledMap` callback, in the **success** branch (currently lines
   273-285, where `completedWorkItems++` runs and `item` is in scope), push
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

3. Include both `succeededWorkItems` and the facility snapshot in the
   `stagingResult` object written to `step_3_result` (currently lines 366-379).
   `facilityIds` is already computed once, at the top of the run, to drive the
   fetch itself ([worker.ts:137](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L137))
   — just include the same variable, no new query:

   ```ts
   const stagingResult: DatasetDhis2StagingResult = {
     // ...existing fields...
     succeededWorkItems,
     fetchedFacilityIds: facilityIds,
   };
   ```

4. **Close the transport-guarantee gap.** At
   [worker.ts:658](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L658),
   `response.rows && response.rows.length > 0` silently treats a missing `rows`
   field as "zero data" rather than "don't trust this response." Change it to
   fail loud:

   ```ts
   // Before:
   if (response.rows && response.rows.length > 0) {

   // After:
   if (!response.rows) {
     throw new Error(
       `DHIS2 analytics response for ${rawIndicatorId}, period ${period} is ` +
       `missing "rows" — treating as a failed fetch, not empty data.`
     );
   }
   if (response.rows.length > 0) {
   ```

   This throw lands inside `fetchIndicatorPeriod`'s single `try/catch`
   ([worker.ts:506-856](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L506-L856)),
   so it becomes `{ success: false }` exactly like every other transport
   failure — no separate handling needed.

That is the entire staging-side change.

### Step 3 — Branch integration on source type and do scoped delete-then-insert

File: [integrate_hmis_data/worker.ts](server/worker_routines/integrate_hmis_data/worker.ts).

The worker already parses the staging result as the discriminated union
`DatasetStagingResult` (line 55), so `stagingResultRaw.sourceType` is available.
Keep **Phase 1/2/3** (validation, version id, version-record insert) unchanged.
Replace **Phase 4** (the UPDATE → delete-matched → INSERT block, lines 165-217)
with a source-type branch.

**DHIS2 branch** (when `stagingResultRaw.sourceType === "dhis2"` **and both**
`succeededWorkItems` and `fetchedFacilityIds` are present):

```ts
const succeeded = stagingResultRaw.succeededWorkItems ?? [];
const fetchedFacilityIds = stagingResultRaw.fetchedFacilityIds ?? [];

// Two parallel arrays, same order, for a set-based UNNEST join. Always
// equal-length by construction — both are built from one .map() over `succeeded`.
const scopeIndicatorIds = succeeded.map((w) => w.indicatorRawId);
const scopePeriodIds = succeeded.map((w) => w.periodId);

// 1) Remove existing rows in the successfully-fetched scope, for exactly the
//    facilities that were queried at staging time (a snapshot, not re-derived —
//    a facility never queried is never touched, whatever its id looks like).
//    Pair-wise (indicator, period) match — NOT a cross product — so a pair
//    that failed to fetch is never deleted.
const deleteResult = await sql`
  DELETE FROM ${sql(datasetTableName)} dt
  USING UNNEST(
    ${scopeIndicatorIds}::text[],
    ${scopePeriodIds}::int[]
  ) AS s(indicator_raw_id, period_id)
  WHERE dt.indicator_raw_id = s.indicator_raw_id
    AND dt.period_id = s.period_id
    AND dt.facility_id = ANY(${fetchedFacilityIds}::text[])
`;
const rowsDeleted = deleteResult.count;

// 2) Insert exactly what DHIS2 returned. DISTINCT ON guards against DHIS2
//    returning the same org unit twice across facility batches — without it, a
//    duplicate (facility_id, indicator_raw_id, period_id) in the source aborts
//    the whole INSERT ("ON CONFLICT DO UPDATE command cannot affect row a
//    second time" — Postgres only dedupes against the TARGET table, never
//    within the inserted batch). After dedup, the delete just cleared this
//    exact scope, so ON CONFLICT should never fire in practice; it's kept as a
//    defensive backstop, not the primary duplicate-handling mechanism.
const insertResult = await sql`
  INSERT INTO ${sql(datasetTableName)}
    (facility_id, indicator_raw_id, period_id, count, version_id)
  SELECT DISTINCT ON (facility_id, indicator_raw_id, period_id)
    facility_id, indicator_raw_id, period_id, count, ${newVersionId}::INTEGER
  FROM ${sql(aggregatedTableName)}
  ORDER BY facility_id, indicator_raw_id, period_id
  ON CONFLICT (facility_id, indicator_raw_id, period_id)
  DO UPDATE SET count = EXCLUDED.count, version_id = EXCLUDED.version_id
`;
const rowsInserted = insertResult.count;
```

Notes on the SQL:

- `UNNEST(${arr}::text[], ${arr}::int[])` binds each JS array as one Postgres
  array parameter (porsager `postgres`), giving a clean set-based join for the
  `(indicator, period)` pairing — `ANY()` can't express this pairwise match (it
  would cross-product). Verify the array binding compiles
  (`deno task typecheck`).
- `facility_id = ANY(${fetchedFacilityIds}::text[])` uses the codebase's
  existing array-binding idiom (`= ANY(...)`, used elsewhere for facility-id
  lists) rather than a second `UNNEST` — simpler than re-deriving the facility
  scope, and needs no shared regex constant, since there's now only one place
  that decides "which facilities": the snapshot captured at staging time.
- If `succeeded` is empty (every fetch failed), the `UNNEST` arrays are empty →
  the DELETE matches nothing. If `fetchedFacilityIds` is empty (shouldn't
  happen — see Step 2 — but defensively), `ANY(...)` also matches nothing. Both
  are safe no-ops.
- The delete covers **every facility in the snapshot** for each succeeded pair
  (not just the ones that returned data) — that is what makes DHIS2
  authoritative and removes the phantom cells.

**No separate correctness argument is needed for the delete scope.** An earlier
version of this plan re-derived "which facilities count" via a regex against
`facilities_hmis` at integration time, and had to argue — via the
`dataset_hmis → facilities_hmis` foreign key — that this matched the fetch
scope from earlier. The snapshot removes that argument entirely: the delete
scope *is*, literally, the list that was queried, captured at the moment it was
queried. There is nothing to prove equivalent to anything else, and a facility
added to `facilities_hmis` between staging and integration is never in the
snapshot, so it's protected regardless.

**CSV branch** (`sourceType === "csv"`, or DHIS2 with `succeededWorkItems` or
`fetchedFacilityIds` undefined — see Step 5): keep the **existing**
UPDATE → delete-matched → INSERT block verbatim. CSV semantics ("absent = keep
prior value") are intended and must not change.

### Step 4 — Version-record counts

The version record currently stores `n_rows_inserted` / `n_rows_updated` (updated
at lines 233-240). For the DHIS2 branch there is no "updated" count; map it as:

- `n_rows_inserted = rowsInserted`
- `n_rows_updated = rowsDeleted` (documented as "rows replaced/removed" for DHIS2)

Keep the CSV branch's existing `rowsUpdated` / `rowsInserted` semantics. This is a
reporting-only decision; pick the mapping and note it in a comment.

### Step 5 — Backward-compatible fallback

An upload attempt staged by **old** code (no `succeededWorkItems` /
`fetchedFacilityIds`) could be integrated by **new** code (e.g. a half-finished
import across a deploy). Guard:

```ts
const useScopedDelete =
  stagingResultRaw.sourceType === "dhis2" &&
  Array.isArray(stagingResultRaw.succeededWorkItems) &&
  Array.isArray(stagingResultRaw.fetchedFacilityIds);
```

If `useScopedDelete` is false, run the **legacy merge** path. This degrades
*safely* (no deletes) rather than risking a wrongful wipe from missing scope
data.

### Step 6 — Show a deletion-count confirm before integrate

The scoped delete is destructive, so the preview should say, in plain numbers,
what it will *remove* — not just what it will insert (which the preview already
shows).

Run the exact same predicate as the eventual DELETE, as a read-only grouped
`COUNT`, at preview time — not an approximation or a proxy signal, the literal
set of rows the DELETE will remove, computed before anything destructive
happens:

```sql
SELECT indicator_raw_id, period_id, COUNT(*) AS n
FROM dataset_hmis dt
WHERE (dt.indicator_raw_id, dt.period_id) IN (/* succeeded pairs */)
  AND dt.facility_id = ANY(${fetchedFacilityIds}::text[])
GROUP BY indicator_raw_id, period_id
```

(Or the equivalent `UNNEST` pairwise-join form, matching Step 3's DELETE
structure exactly — same shape, same scope, `SELECT COUNT(*)` instead of
`DELETE`.)

Surface it at the staging→integrate preview (the component that already renders
`periodIndicatorStats`, e.g. `step_4_dhis2.tsx`): per `(indicator, period)` row,
show "N existing rows will be removed" alongside the existing staged-row count;
plus a total summary line ("This import will remove N existing cells and write M
cells"). Require an explicit confirm (e.g. a checkbox) before the integrate
action is enabled.

This replaces an earlier design considered and dropped for this plan — a DHIS2
reference-total reconciliation with a coverage ratio. That design needed a DHIS2
API call the analytics client doesn't support as written, compared numbers
computed by two different aggregation methods (making the ratio unsound), and —
the decisive point — **could not detect the failure mode that matters most**
(stale DHIS2 analytics), because a reference total would read the same stale
tables the primary fetch does. The deletion-count confirm needs no new DHIS2
call, no reference total, and no ratio math: it tells the user exactly what the
destructive step will do, using data we already have with certainty.

## Edge cases

| Case | Behaviour | Correct? |
| --- | --- | --- |
| Cell value 100 → 0 / deleted in DHIS2 | Pair fetched OK, no row returned → existing row deleted | ✅ matches DHIS2 |
| Cell value 100 → 60 in DHIS2 | Row returned → deleted then re-inserted as 60 | ✅ |
| New cell (0 → 50) | Row returned → inserted | ✅ |
| Fetch for an `(indicator, period)` fails | Not in `succeededWorkItems` → **not** deleted, **not** inserted → prior value kept | ✅ no data loss |
| HTTP 200 with valid JSON but missing `rows` | Step 2's fix throws → not a success → not deleted (closes the one identified transport-guarantee gap) | ✅ |
| All fetches fail | Empty scope → no-op | ✅ |
| DHIS2 returns same OU twice across batches | `SELECT DISTINCT ON` dedupes before insert; `ON CONFLICT DO UPDATE` is a defensive backstop, not the primary handling | ✅ (previously: would crash the transaction — fixed) |
| Non-UID (CSV-origin) facility, same indicator+period as a DHIS2 import | Never in `fetchedFacilityIds` (never queried) → **not** deleted | ✅ preserved |
| Facility added to `facilities_hmis` after staging, before integrate | Not in the `fetchedFacilityIds` snapshot (captured at staging time) → **not** deleted, regardless of shape | ✅ preserved by construction |

## Behavioural caveat (call out before merge)

Scoped delete makes a DHIS2 import **authoritative over every facility it
actually queried**, for each indicator × period it fetched — it removes prior
rows for those facilities regardless of which source originally wrote them. The
snapshot (`fetchedFacilityIds`) means this is exactly the facility set queried,
nothing broader and nothing narrower. The one residual: at staging time, the
facility query itself is still shape-filtered to DHIS2-UID-looking ids
([stage_hmis_data_dhis2/worker.ts:132-135](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L132-L135))
— a CSV-imported facility whose `facility_id` happens to be UID-shaped (11
alphanumerics, letter-first) is queried, ends up in the snapshot, and would be
deleted by a DHIS2 import of the same indicator+period. The code has only
`facility_id` and no source column, so it genuinely cannot tell that row apart
from a DHIS2 facility. This is a narrow surface (an accidental shape collision)
and cannot be closed without a per-row source marker.

## Residual risks (and why they're acceptable / how to harden)

1. **Silent org-unit truncation inside a 200 response** (DHIS2 drops some
   requested OUs that had data, but the response still has a valid, non-empty
   `rows` array — not the missing-`rows`-field case, which Step 2 now catches).
   Structurally bounded by `FACILITY_BATCH_SIZE = 100` and the hard 2048-char
   URL guard ([worker.ts:576-584](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L576-L584)).
   The Step 6 deletion-count confirm gives the user visibility into an
   unusually large deletion if this happens, though it is advisory, not a
   technical guarantee. Note: the existing `suspiciousBatches` block is **dead
   code** — its guard `urlLength > 2048` already threw 175 lines earlier
   ([worker.ts:576](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L576))
   — so it is not a safeguard; **delete it** to avoid the false impression that
   it is one.
2. **DHIS2 analytics staleness** (data was changed in DHIS2 but the analytics
   tables haven't regenerated yet — a 200 that is complete relative to DHIS2's
   current *analytics* state, but that state is behind DHIS2's *live* data).
   This is a genuine, structural limit: no HTTP-layer check can distinguish
   "genuinely no data" from "not yet reflected in analytics," because both
   produce an identical response — the request/transport layer is airtight (see
   the exhaustiveness note above and Step 2's gap closure), but that guarantee
   is about transport, not about DHIS2's internal data freshness. A time-based
   cool-down (skip the scoped delete for very recent periods) was considered and
   **rejected**: the recency threshold has no principled value, and the decision
   was to trust DHIS2's own contract — what analytics returns is treated as
   ground truth — rather than second-guess it with an arbitrary heuristic.
   Accepted as out of scope for this plan.
3. **`_SKIP_META = true`** disables missing-OU detection
   ([worker.ts:65](server/worker_routines/stage_hmis_data_dhis2/worker.ts#L65)).
   This does **not** affect the delete approach: an OU absent from DHIS2 and an
   OU with no data both correctly resolve to "no row" = deleted. (Seeding zeros
   would have needed this distinction; delete does not.)

## Testing

> Server has no `--watch`; worker/lib changes require a manual server restart
> before they take effect.

1. `deno task typecheck` (covers both server and client; confirms the type
   change and the `UNNEST` / `ANY` array bindings compile).
2. **Empirical, on a disposable instance** (query real rows, don't theorise):
   - Import an `(indicator, period)` with non-zero values for several facilities.
     Confirm rows in `dataset_hmis`.
   - In DHIS2, set one facility's value to 0 / delete it. Re-import the same
     scope.
   - **Expect:** that facility's row is **gone** from `dataset_hmis`; others
     updated to current values; the staged sum drops by that facility's old
     value.
   - **Failure-path check:** point at an unreachable DHIS2 (or a period known to
     500) so a work item fails; confirm that pair's existing rows are **retained**
     (not deleted) and `failedFetches` is populated.
3. **Response-shape gap closure:** simulate (or force) a 200 response with valid
   JSON but no `rows` field; confirm the work item now **fails**
   (`success: false`, appears in `failedFetches`) rather than silently staging as
   empty.
4. **Duplicate-OU handling:** stage a source with two rows for the same
   `(facility_id, indicator_raw_id, period_id)`; confirm integration **succeeds**
   (no "cannot affect row a second time" error) and the surviving row is
   deterministic.
5. **Deletion-count confirm:** confirm the preview shows a per-pair "will remove
   N" count that matches an independent `SELECT COUNT(*)` against `dataset_hmis`
   using the same scope, and that the integrate action requires the explicit
   confirm.
6. **Facility-added-mid-review:** stage, then — before integrating — add a new
   UID-shaped facility with pre-existing `dataset_hmis` rows for a succeeded
   pair; confirm those rows **survive** integration (not in the snapshot).
7. **CSV regression:** run a CSV import that omits a previously-present cell;
   confirm the old value is **kept** (merge unchanged).
8. Sanity-check `dataset_hmis_versions` counts (`n_rows_inserted`,
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
  [PLAN_IMPORTER_CONSOLIDATION.md](PLAN_IMPORTER_CONSOLIDATION.md).

## Rollback

Single-commit revert. No schema migration, no data backfill. Attempts staged
with `succeededWorkItems` / `fetchedFacilityIds` simply have unused fields;
integration falls back to the legacy merge, and the preview drops the
deletion-count column, once reverted.

## File-change summary

| File | Change |
| --- | --- |
| [lib/types/dataset_hmis_import.ts](lib/types/dataset_hmis_import.ts) | Add optional `succeededWorkItems` and `fetchedFacilityIds` to `DatasetDhis2StagingResult` |
| [stage_hmis_data_dhis2/worker.ts](server/worker_routines/stage_hmis_data_dhis2/worker.ts) | Accumulate succeeded `(indicator, period)` pairs (incl. empties); snapshot the queried `facilityIds` into `step_3_result`; fix the `response.rows` shape guard to fail loud instead of silently treating missing `rows` as empty; **delete dead `suspiciousBatches` block** |
| [integrate_hmis_data/worker.ts](server/worker_routines/integrate_hmis_data/worker.ts) | Branch on `sourceType`; DHIS2 → scoped delete-then-insert against the `fetchedFacilityIds` snapshot (`= ANY(...)`), `DISTINCT ON` dedupe before `INSERT ... ON CONFLICT`; CSV → unchanged; fallback when scope absent; version-count mapping |
| staging→integrate preview (client) | Per-pair "N existing rows will be removed" (exact, from the same predicate as the DELETE) + total summary; explicit confirm required before integrate |
