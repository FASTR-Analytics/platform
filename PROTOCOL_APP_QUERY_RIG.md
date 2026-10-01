# PROTOCOL (App): The Query Test Rig

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_. Read it when **adding a case** to the S9
> query rig or changing SQL assembly. The query pipeline's ownership and
> architecture belong to **S9**: see `SYSTEM_09_viz_query_cache.md`; this file
> is the how-to. Sibling rig: `./validate_migrations`
> (`PROTOCOL_APP_MIGRATIONS.md`).

---

## What it is

`./validate_queries` builds a **real results package** per declarative fixture.
The fixture's rows are written as the module's raw output CSV, then the
**production** parquet writer and package builder (`buildRunPackageIntoTmp`)
produce the parquet and the manifest into a throwaway runs directory. It then
runs the **production** run read path (`server/run_query/run_read.ts`:
`getPresentationObjectItemsFromRun`, `getPossibleValuesFromRun`,
`getResultsValueInfoFromRun`, `getResultsObjectItemsFromRun`, and
`computeRunReplicantOptions` from `run_data_reads.ts`) against it over a
`RunReadContext` at the case's scope (the unconstrained definition, the whole
package, unless the case carries a `scope`). Config → SQL → DuckDB over parquet
→ real rows: the engine production serves from, not a stand-in. Nothing is
mocked and there is no test seam. A throwaway Postgres survives only for what
the package builder reads from the MAIN database (the per-family structure
schema rows in `instance_config`).

```bash
./validate_queries            # ~15s: container up, 18 packages built, 212 cases
```

(once the `postgres:17.4` image is cached locally; the first run pulls it.)

Also offered as an optional prompt in `./deploy`, next to migration validation.
**Not** in `deno task typecheck`, not because it is slow, but because it needs a
running Docker daemon, and the typecheck gate must work without one. The rig
typechecks itself before running, since `query_rig/` sits outside
`lint_systems`' tracked globs.

| File                         | Role                                                                          |
| ---------------------------- | ----------------------------------------------------------------------------- |
| `validate_queries`           | container + runs-dir lifecycle, env, invokes the runner                       |
| `query_rig/mod.ts`           | runner: build packages, loop cases, summarise                                 |
| `query_rig/cases.ts`         | **the case table**, where you add coverage                                    |
| `query_rig/fixtures.ts`      | F1–F18                                                                        |
| `query_rig/build_package.ts` | fixture → structure-schema rows + results package + unscoped `RunReadContext` |
| `query_rig/harness.ts`       | connections, schema loading, multiset compare                                 |

## Adding a case

Add a row to `CASES` in `query_rig/cases.ts`. That is the whole operation: one
literal, one place to look.

```ts
{
  name: "filter on __BLANK returns exactly the rows the fold grouped",
  fixture: "hmis_monthly",
  fetchConfig: {
    ...base(),
    groupBys: ["admin_area_2"],
    filters: [{ disOpt: "source_indicator", values: [BLANK_SENTINEL] }],
  },
  expect: { status: "ok", rows: [ /* … */ ] },
}
```

- `expect` is one of `{status:"ok", rows}`,
  `{status:"no_data_available" |
  "too_many_items"}`, `{values}` (option lists,
  **ordered**), `{dimStatus}` (one dimension's option-list status),
  `{periodBounds}` (the metric-info payload's bounds, `null` for none),
  `{replicantIds}` (the replicant read's option ids, ordered, empty for
  `no_values_available`), `{rawCount}` (the raw preview's `totalCount`, which
  must also be its row count, 0 for `no_data_available`), or `{err}` (substring
  match).
- `calendar: "ethiopian"` flips `setCalendar()` for that case:
  `getQuarterIdExpression` emits different SQL per calendar.
- `scope: geographyOnlyScopeDefinition("A2_south")` reads through a context
  whose `scope` is that `ScopeDefinition` and whose `scopeToken` is its hash.
  The rig builds the context itself, because the production gate
  (`getReadyRunReadContext`) loads the definition from a `scopes` row and the
  rig's scopes exist only in the case table. Absent = the unconstrained
  definition. Scope is a predicate on the view the query runs against, which the
  caller's fetch config never shows, so pair every scoped case with the unscoped
  reading of the same query. On every items case the runner also asserts that
  the echoed `fetchConfig` is the request and that the holder's `runId` /
  `scopeToken` are the context's.
- `entry: "possibleValues"` with `disOpt` runs the option-list query instead of
  the items query, reusing `fetchConfig.filters` as the filter set.
- `entry: "metricInfo"` resolves the fixture's `metric` through the enricher and
  asserts a `dimStatus`: `status`, `namedCount` (sentinel excluded), and
  `isSingleValueDim` (which runs the real `getSingleValueDimsFromPossibleValues`
  over the whole payload), or the payload's `periodBounds`. Requires the fixture
  to declare a `metric`.
- `entry: "replicantOptions"` with `disOpt` as `replicateBy` runs the replicant
  read's compute below its cache (`computeRunReplicantOptions`) with the whole
  `fetchConfig`, period filter included.
- `entry: "rawPreview"` runs the raw-rows preview. It takes no fetch config.

## The scope matrix

`SCOPE_MATRIX_ROWS` in `cases.ts` holds one row per branch of
`scopePredicateFor` (the table in SYSTEM_09 "The scoped view"), and each row
generates five cases, one per read kind: items, option list, metric info,
replicant options and raw preview. A row is the fixture, the scope, the
dimension to group by, the grouped `rows` and the `rawCount`; the other
expectations follow from those. To cover a new branch, add one row.

A row whose dimension does not apply to its fixture spreads the fixture's entry
in `WHOLE`, the whole-package reading, which is itself a row. That is how the
default principle is asserted: the same rows as the whole package, on every read
kind. Pick a scope that removes a whole group, so the option lists change as
well as the sums: a year range that keeps every area leaves the option-list,
metric-info and replicant cases green under a broken predicate.

## Adding a fixture

Only when no existing fixture can express the shape: a different physical time
column, a missing `facility_id`, a different **column type**. Fixtures are
synthetic and small: 2–8 hand-designed rows sitting on semantic edges. Never
seed from a dump: it can't be committed and it makes assertions drift. The one
exception is F9, which generates 501 rows because the behaviour under test _is_
a 500-row boundary; generate rather than enumerate when the count is the point.

A results object's parquet schema comes from the module's declared
`createTableStatementPossibleColumns` (types are declared, never inferred), so
each fixture declares `roColumns` **with explicit types** in that authoring
vocabulary (`TEXT` / `INTEGER` / `NUMERIC`, the last landing as `DOUBLE`). The
types are load-bearing, not decoration. See the F2/F3 pair below.

## Rules that keep the rig honest

**Rows compare as a multiset.** The queries carry no `ORDER BY`, so sequence
comparison is flaky by construction. `harness.ts` canonicalises before
comparing. Option lists are the exception: there, order _is_ the assertion.

**Assert what our code guarantees, not what the database happens to do.** The
`possibleValues` cases pin the sentinel in the **last** position because TS puts
it there; the relative order of the named values is DuckDB's under the pinned
`@duckdb/node-api` version. If a DuckDB bump reshuffles those, it is an engine
ordering change, not a regression.

**Design numbers so a wrong implementation cannot coincidentally pass.** The
roll-up PAE case uses 60/200 and 20/800 precisely because mean-of-ratios
(0.1625) and the correct recompute-after-union (80/1000 = 0.08) diverge. Equal
numbers would have proved nothing.

**Reproduce the route's sequence, not just the query function.**
`validateFetchConfig` runs in the **handler**, not inside
`getPresentationObjectItemsFromRun`. The runner calls it explicitly. Skip it and
every SQL-safety case silently becomes a no-op.

**Calendar is a run input.** The read path takes it from the manifest, never
from the env global, so a case's `calendar` is applied by handing the read
function a context whose manifest copy says so (`contextFor` in `mod.ts`).

**Never encode behaviour you have not judged.** When a case fails, the default
assumption is that the _code_ is wrong, not the expectation. Only pin observed
behaviour after confirming it is intended, and say so in a comment with the
reason. Two live examples:

- `rollupDim` absent from `groupBys` does not error: `buildRollupQuery` returns
  `null` and the roll-up row is silently omitted. Intended: those checks are the
  SQL-safety boundary, and the client owns the collapse decision (S9). The case
  pins the contract; it does not bless the silence.
- The `quarter_id` + calendar-filter block in `getPeriodFilterExactBounds` looks
  dead and is not. Deleting it turns "show all data" into `no_data_available`.
- `COUNT(...)` values are **numbers** on the wire. The rig's Postgres era pinned
  them as strings (`"4"`) because postgres.js serialises bigint as text; DuckDB
  returns them as numbers, which is what production has served since the runs
  cutover. Found on 2026-09-04 when the rig moved onto the run read path. The
  two cases were corrected, and this is the class of gap the move exists to
  expose.

**Prove a new guard's case can fail.** Passing tests prove nothing on their own.
Temporarily break the mechanism, confirm the case goes red, then restore.
Verified controls so far (the failure texts were recorded on the rig's Postgres
era, 2026-08; DuckDB words the same failures differently: the case that goes red
is the control, not the text):

| Break                                                                    | Expected failure                                                                                                                                            |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shouldFoldBlank` → name-only gate                                       | F3: `function btrim(integer, unknown) does not exist`                                                                                                       |
| `exceedsMaxReplicantOptions` → count all values                          | F9 500-case: `ok` → `too_many_values`                                                                                                                       |
| drop the multi-membership skip in `getSingleValueDimsFromPossibleValues` | F8: `isSingleValueDim=false` → `true`                                                                                                                       |
| `emitsSampleN` → family-only gate (drop `hasFacilityId`)                 | F10: `column ro_….facility_id does not exist`                                                                                                               |
| `COUNT(DISTINCT facility_id)` → `COUNT(facility_id)`                     | 4 cases: n reports rows (4/4/8) instead of facilities (2/3/5)                                                                                               |
| drop `sourceTable.` from the value aggregates (buildAggregateColumns)    | both Ghana-shape cases: `column reference "facility_id" is ambiguous`                                                                                       |
| drop `sourceTable.` from the plain-values sample-n FILTER                | HFA Ghana-shape case only: same ambiguity error                                                                                                             |
| wrapper `groupByPrefix` → plain join (no collision re-alias)             | both F12 PAE cases: `column reference "denominator" is ambiguous`                                                                                           |
| disable the non-PAE value-prop guard in `validateFetchConfig`            | F12 boundary case: expected error, got success (silent key clobber)                                                                                         |
| disable buildWhereClause's numeric filter branch                         | both F12 filter cases: `function upper(numeric) does not exist`                                                                                             |
| drop the PERIOD exclusion from the numeric filter gate                   | month-filter case: derived TEXT month misrouted to `month IN (2)`                                                                                           |
| `scopePredicateFor` returns no predicate                                 | the 8 scoped cases go red (items, option list, metric info, child column, no children, fail-closed); the 5 paired national readings stay green (2026-10-01) |
| drop the modules part of `scopePredicateFor`                             | 5 red of 212: the "module is outside the list" row on all five read kinds (2026-10-01)                                                                      |
| drop the geography part                                                  | 28 red: the three geography rows and the combined row on all five read kinds, and the 8 scoped cases above                                                  |
| `timePredicate` returns nothing for the year range                       | 11 red: the `period_id` and `year` rows on all five read kinds, and the `quarter_id` case                                                                   |
| `timePredicate` returns nothing for `time_point`                         | 11 red: the time-point row and the empty-list row on all five read kinds, and the INTEGER `time_point` case                                                 |
| drop the indicator parts                                                 | 17 red: the three indicator rows on all five read kinds, and the combined row's items and raw preview                                                       |
| `scopedPeriodBounds` returns the stamp unclamped                         | 3 red: the clamped bounds, the no-overlap bounds, and the replicant read's relative filter under years                                                      |
| drop the predicate from the facilities views                             | 1 red: "facilities view: it takes the geography part of the scope"                                                                                          |

Check `git status` on the file first and restore by copy if it has uncommitted
changes. `git checkout` would discard parallel work.

## The fixtures

| Fixture                      | Shape                                                                         | Exists for                                                                                                                                                              |
| ---------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `hmis_monthly` (F1)          | HMIS, physical `period_id`, facility rows                                     | general grouping, blank-fold specimens (`NULL`, spaces, tab, and the `'x'`/`' x'` pair), derived month/quarter/year                                                     |
| `hfa_service_cats` (F2)      | HFA, `hfa_service_category` pipe-joined sets, `time_point` **text**           | multi-membership, blank fold on text                                                                                                                                    |
| `hfa_timepoint_integer` (F3) | F2 with `time_point` **integer**                                              | the type gate, see below                                                                                                                                                |
| `hmis_ratio` (F4)            | facility rows + `num`/`den`                                                   | PAE roll-up, AVG eligibility (allowed)                                                                                                                                  |
| `hmis_area_only` (F5)        | pre-aggregated areas, **no** `facility_id`                                    | AVG eligibility (refused)                                                                                                                                               |
| `hmis_quarterly` (F6)        | physical `quarter_id`                                                         | derives `year`, never `month`                                                                                                                                           |
| `hmis_yearly` (F7)           | physical `year`                                                               | derives nothing                                                                                                                                                         |
| `hfa_facility_blanks` (F8)   | NULL facility cell + a results row with no facilities row                     | the fold reaches joined facility columns, from both blank origins; single-member set column                                                                             |
| `hmis_option_cap` (F9)       | 500 named + blank / 501 named                                                 | the option-list cap counts NAMED values only                                                                                                                            |
| `hfa_area_only` (F10)        | HFA, pre-aggregated area rows, **no** `facility_id`                           | the table-aware half of the sample-n gate. The family check alone would emit `COUNT(DISTINCT facility_id)` against a table without the column                           |
| `hfa_variants` (F11)         | HFA, `hfa_variant_item` plain TEXT physical column, parent in `hfa_indicator` | the generic physical-column path for group-by / filter / option lists on the variants dimension                                                                         |
| `hmis_scorecard` (F12)       | `denominator` is BOTH a PAE ingredient and a disaggregation option            | the PAE groupBy/value-prop collision (`paeCollidingGroupBys`): den=20 spans two rows so raw-binding (40/20 = 2) diverges from the correct aggregate binding (40/40 = 1) |
| `hfa_divergent_schema` (F13) | HFA depth 2, `includeTypes` on, seeded beside a divergent HMIS row            | the per-family structure-schema split; also the metric-info half of the scope cases                                                                                     |
| `hmis_admin3_only` (F14)     | HMIS, `admin_area_3` and NO `admin_area_2`, F1's facilities                   | the child-column predicate: A2_south resolves to its child areas through the facilities view, by name; an unknown area has no children and matches nothing              |
| `admin3_no_facilities` (F15) | F14's shape in a package with no facilities parquet (`facilities: null`)      | the fail-CLOSED branch: no facilities view to resolve the scope's child areas, so the predicate is `FALSE` and a scoped read returns no rows rather than national rows  |
| `hmis_scope_dims` (F16)      | HMIS, `period_id` over three years, two indicators, no `facility_id`          | the year range, the `hmis` indicator list, the module list, the period-bound clamp; values are powers of two, so every subset of rows has its own sum                   |
| `hfa_scope_dims` (F17)       | the HFA shape: `time_point`, `hfa_indicator`, no physical time column         | the time-point list, the `hfa` indicator list, and a year range not applying                                                                                            |
| `iceh_scope_dims` (F18)      | family `iceh`: `iceh_indicator`, physical `year`, no admin column             | the `iceh` indicator list, the year range on a `year` column, and geography not applying                                                                                |

**F2/F3 are a minimal pair and the rig's central argument.** They differ in one
thing: `time_point`'s declared column type. The blank fold emits `btrim()` and
returns a text sentinel from its `CASE`, both of which Postgres rejects on a
numeric column, so a name-only gate turns working visualizations into a hard SQL
error. Results-column types are authored per module, so the same disaggregation
option genuinely is text in one instance and integer in another. No SQL-string
assertion can see this class of bug; only execution can.

## Out of scope

Valkey / `TimCacheC` (S3 machinery, another container); version-hash
byte-identity (a pure assertion needing no DB); the route-level Zod schema
(already a boundary schema); the client tier.

## Anti-cruft contract

One rig, one case table. No `Deno.test`, no `deno task test`: a plain loop with
a pass/fail summary, so there is no gravity well for stray unit tests to
accumulate in. Coverage grows by adding rows, not files.
