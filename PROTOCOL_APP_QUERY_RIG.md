# PROTOCOL — App: The Query Test Rig

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **adding a case** to the
> S9 query rig or changing SQL assembly. The query pipeline's ownership and
> architecture belong to **S9** — see `SYSTEM_09_viz_query_cache.md`; the
> package format belongs to **S8** — see
> `SYSTEM_08_results_packages.md`. This file is the how-to. Sibling rig:
> `./validate_migrations` (`PROTOCOL_APP_MIGRATIONS.md`).

---

## What it is

`./validate_queries` seeds declarative fixtures as throwaway **results
packages** — a run directory holding `manifest.json`, the input mirrors and one
results object's parquet — and runs the **production** run-read machinery in
`server/run_query/` against them. Config → SQL → real rows. Nothing is mocked
and there is no test seam: the read functions already take a `RunReadContext`
as a parameter, so the rig just hands them contexts pointing at its own
packages.

The four entry points under test:

| Function | What the rig drives it with |
| --- | --- |
| `getPresentationObjectItemsFromRun` → `getPresentationObjectItemsCore` | the items query — the bulk of the corpus |
| `getPossibleValuesFromRun` | `entry: "possibleValues"` — option lists, **ordered** |
| `getResultsValueInfoFromRun` | `entry: "metricInfo"` — one dimension's option-list status |
| `getIndicatorMetadataFromRun` | the label map every option list is labelled through |

```bash
./validate_queries            # ~2s: 16 packages, 76 cases
```

There is **no container**. The read plane is DuckDB-over-parquet, which is
in-process, so the rig needs nothing but a scratch directory — the wrapper
script mints one with `mktemp -d`, points `SANDBOX_DIR_PATH`
(= `_RUNS_DIR_PATH`) at it, and deletes it on exit. The real `.env` is
deliberately never sourced, so the rig can neither reach a database nor read a
live instance's packages.

Every query opens its own in-memory DuckDB instance, exactly as serving does —
a rig that pooled connections would be measuring something the server never
does. The runner ends with an explicit `Deno.exit(0)`: the DuckDB node addon
does not reliably release the event loop, and a rig that hangs after printing
its verdict would hang `./deploy` behind it.

Also offered as an optional prompt in `./deploy`, next to migration validation,
and run by `./deploy_testing`. Still **not** in `deno task typecheck`: the
reason it was excluded (a running Docker daemon, which the typecheck gate must
not require) no longer applies, so folding it into the gate is now only a
question of whether the gate should own it. Until that is decided the rig
typechecks itself before running, since `query_rig/` sits outside
`lint_systems`' tracked globs.

| File | Role |
| --- | --- |
| `validate_queries` | scratch runs dir, env, invokes the runner |
| `query_rig/mod.ts` | runner: seed packages, loop cases, summarise |
| `query_rig/cases.ts` | **the case table** — where you add coverage |
| `query_rig/fixtures.ts` | F1–F16 |
| `query_rig/seed.ts` | fixture → results package |
| `query_rig/harness.ts` | runs dir, read contexts, multiset compare |

## Adding a case

Add a row to `CASES` in `query_rig/cases.ts`. That is the whole operation —
one literal, one place to look.

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

- `expect` is one of `{status:"ok", rows}`, `{status:"no_data_available" |
  "too_many_items"}`, `{values}` (option lists, **ordered**), `{dimStatus}` (one
  dimension's option-list status), or `{err}` (substring match).
- `adminArea2: "A2_south"` runs the case scoped; absent means national
  (`adminArea2: null`), which is what the rest of the corpus runs at. Scope is
  a property of the read CONTEXT, not of the fetch config — it reaches items,
  option lists and metric info alike.
- `calendar: "ethiopian"` rewrites the fixture manifest's `calendar` field for
  that case. The calendar is package data now, never a process global: the read
  path takes it from the manifest, and `getQuarterIdExpression` emits different
  SQL per calendar.
- `entry: "possibleValues"` with `disOpt` runs the option-list query instead of
  the items query, reusing `fetchConfig.filters` as the filter set.
- `entry: "metricInfo"` resolves the fixture's `metric` from the manifest and
  asserts a `dimStatus`: `status`, `namedCount` (sentinel excluded), and
  `isSingleValueDim` (which runs the real
  `getSingleValueDimsFromPossibleValues` over the whole payload). Requires the
  fixture to declare a `metric`.

Every items case additionally asserts, in the runner, that the holder echoes
the caller's `fetchConfig` verbatim and carries `(runId, scopeToken)` as its
identity — the scope injects filters internally, and a holder that echoed them
would teach the client (and its cache) a request it never made.

## Adding a fixture

Only when no existing fixture can express the shape — a different physical time
column, a missing `facility_id`, a different **column type**, a different admin
column. Fixtures are synthetic and small — 2–8 hand-designed rows sitting on
semantic edges. Never seed from a dump: it can't be committed and it makes
assertions drift. The one exception is F9, which generates 501 rows because the
behaviour under test _is_ a 500-row boundary; generate rather than enumerate
when the count is the point.

A fixture IS a package, and `seed.ts` builds it with the same writers the
wizard finalize uses:

```text
{runs dir}/{runId}/
  manifest.json                                  runManifestSchema-parsed before it is written
  inputs/facilities_{hmis,hfa}.parquet           exportRowsToParquet, all 13 RUN_FACILITY_COLUMN_NAMES as VARCHAR
  inputs/indicators.json                         non-HFA fixtures — the common-indicator dictionary
  inputs/hfa_*_snapshot.json                     HFA fixtures — indicators, categories, sub/service categories, variant groups/items
  outputs/{moduleId}/{resultsObjectId}.parquet   writeNormalizedResultsObjectParquet, from an R-shaped CSV
```

Three consequences worth knowing before you write one:

- **Declared column types are load-bearing**, exactly as they are in a module's
  `createTableStatementPossibleColumns`: `roColumns` declares TEXT / INTEGER /
  NUMERIC and the finalize normalizer maps them (NUMERIC → DOUBLE). See the
  F2/F3 pair below.
- **The manifest is stamped from the parquet that was just written** — columns,
  `hasFacilityId`, `physicalTimeColumn`, `rowCount`, `periodBounds` come from a
  DESCRIBE + aggregate over the file, and `availableDisaggregationOptions` from
  the real `deriveAvailableDisaggregationOptions`. A hand-written manifest could
  disagree with its own parquet and pin a shape production cannot produce.
- **The structure-schema slot travels with the facilities parquet.** A fixture
  declares `facilities: [{ family, columns, rows }]`; each entry writes that
  family's parquet AND fills `structureSchemaHmis`/`structureSchemaHfa`. A
  package with no facilities for a family carries `null` there, as production
  does.

Fixture rows go through the real CSV reader, so blankness survives verbatim:
NULL is the unquoted nullstr `NA`, and every text value is quoted (`'   '`, a
tab and `''` all reach the parquet intact under `allow_quoted_nulls=false`).

## Rules that keep the rig honest

**Rows compare as a multiset.** The queries carry no `ORDER BY`.
`duckdb_executor.ts` does pin a deterministic total order over every result
set, but that is a determinism device (identical queries → identical row
sequences), not a meaningful sort — asserting it would pin the executor's
tie-break rules as if they were query semantics. `harness.ts` canonicalises
before comparing. Option lists are the exception — there, order _is_ the
assertion.

**Assert what our code guarantees, not what the engine happens to do.** The
`possibleValues` cases pin the whole order because `get_possible_values.ts`
re-sorts in TS with a hand-rolled comparator and moves the sentinel last — DuckDB
orders text by binary code unit, and the SQL `ORDER BY` survives only to make
the `LIMIT` cutoff stable. Aggregate types are the same kind of fact: `COUNT`
returns BIGINT and the executor resolves BigInt to number (throwing outside the
safe-integer range), so a COUNT metric's value is a number.

**Design numbers so a wrong implementation cannot coincidentally pass.** The
roll-up PAE case uses 60/200 and 20/800 precisely because mean-of-ratios
(0.1625) and the correct recompute-after-union (80/1000 = 0.08) diverge. Equal
numbers would have proved nothing.

**Reproduce the route's sequence, not just the query function.**
`validateFetchConfig` runs in the **handler**, not inside the read function —
the runner calls it explicitly. Skip it and every SQL-safety case silently
becomes a no-op.

**Pair every scoped case with its national reading.** Scope is applied by
injecting filters the caller never sent, so a scoped expectation alone cannot
distinguish "correctly narrowed" from "narrower for some other reason". Each of
`computeScopeFilters`' branches carries a pair.

**Never encode behaviour you have not judged.** When a case fails, the default
assumption is that the _code_ is wrong, not the expectation. Only pin observed
behaviour after confirming it is intended, and say so in a comment with the
reason. Three live examples:

- `rollupDim` absent from `groupBys` does not error —
  `buildRollupQuery` returns `null` and the roll-up row is
  silently omitted. Intended: those checks are the SQL-safety boundary, and the
  client owns the collapse decision (S9). The case pins the contract; it does
  not bless the silence.
- The `quarter_id` + calendar-filter block in `getPeriodFilterExactBounds` looks
  dead and is not. Deleting it turns "show all data" into `no_data_available`.
- A scoped read of an RO with **no** admin column returns everything. That is
  the one blessed unfiltered case (S8's scope ruling), not a leak — a national
  RO carries no area to filter on, and refusing to serve it would blank every
  scoped product. The sibling case pins the opposite ruling: an RO that HAS an
  admin column but cannot resolve the scope fails CLOSED.

**Prove a new guard's case can fail.** Passing tests prove nothing on their own.
Temporarily break the mechanism, confirm the case goes red, then restore.
Verified controls so far (all re-verified against DuckDB when the rig moved off
Postgres):

| Break | Expected failure |
| --- | --- |
| `shouldFoldBlank` → name-only gate (drop the `textColumns` check) | F3 and every F12 case grouping by `denominator`: `Binder Error: No function matches … 'trim(INTEGER, STRING_LITERAL)'` / `trim(DOUBLE, …)` |
| `exceedsMaxReplicantOptions` → count all values | F9 500-case: `ok` → `too_many_values` |
| drop the multi-membership skip in `getSingleValueDimsFromPossibleValues` | F8: `isSingleValueDim=false` → `true` |
| `emitsSampleN` → family-only gate (drop `hasFacilityId`) | F10: `Binder Error: … does not have a column named "facility_id"` |
| `COUNT(DISTINCT facility_id)` → `COUNT(facility_id)` | 10 cases: n reports rows instead of facilities |
| drop `sourceTable.` from the value aggregates (buildAggregateColumns) | both Ghana-shape cases: `Binder Error: Ambiguous reference to column name "facility_id"` |
| drop `sourceTable.` from the plain-values sample-n FILTER | HFA Ghana-shape case only: same ambiguity error |
| wrapper `groupByPrefix` → plain join (no collision re-alias) | both F12 PAE cases: the group KEY becomes the aggregate (`denominator: 40`, not 20). DuckDB resolves the duplicate name instead of rejecting it, so this defect is now a silently mislabelled group rather than the ambiguity error Postgres raised |
| disable the non-PAE value-prop guard in `validateFetchConfig` | F12 boundary case: expected error, got success (silent key clobber) |
| disable buildWhereClause's numeric filter branch | both F12 filter cases: `Binder Error: No function matches … 'upper(DOUBLE)'` |
| `SET integer_division = true` → `false` in `duckdb_executor.ts` | both F16 quarter cases: month 10 lands in quarter **5**, Ethiopian month 12 one year further out |
| `computeScopeFilters`' fail-closed branch returns `[]` | F15 scope case: `no_data_available` → `ok`, i.e. national rows under a regional heading |
| drop the fetchConfig echo restore in `getPresentationObjectItemsFromRun` | all four scoped items cases: "echoed fetchConfig is not the request" |

One control did NOT survive the move and is deliberately absent: dropping the
PERIOD exclusion from the numeric-filter gate used to break the derived-`month`
case with `text = integer`. DuckDB implicitly casts (`'02' IN (2)` is true), so
the misroute now returns the right rows by luck and no case goes red. The
exclusion is still correct — the month case still pins the OUTPUT — but the rig
cannot prove it load-bearing on this engine.

Check `git status` on the file first and restore by copy if it has uncommitted
changes — `git checkout` would discard parallel work.

## The fixtures

| Fixture | Shape | Exists for |
| --- | --- | --- |
| `hmis_monthly` (F1) | HMIS, physical `period_id`, facility rows, RO carries `admin_area_2` | general grouping, blank-fold specimens (`NULL`, spaces, tab, and the `'x'`/`' x'` pair), derived month/quarter/year, the DIRECT scope filter |
| `hfa_service_cats` (F2) | HFA, `hfa_service_category` pipe-joined sets, `time_point` **TEXT** | multi-membership, blank fold on text |
| `hfa_timepoint_integer` (F3) | F2 with `time_point` **INTEGER** | the type gate — see below |
| `hmis_ratio` (F4) | facility rows + `num`/`den` | PAE roll-up, AVG eligibility (allowed) |
| `hmis_area_only` (F5) | pre-aggregated areas, **no** `facility_id` | AVG eligibility (refused) |
| `hmis_quarterly` (F6) | physical `quarter_id` | derives `year`, never `month` |
| `hmis_yearly` (F7) | physical `year` | derives nothing |
| `hfa_facility_blanks` (F8) | NULL facility cell + a results row with no facilities row | the fold reaches joined facility columns, from both blank origins; single-member set column |
| `hmis_option_cap` (F9) | 500 named + blank / 501 named | the option-list cap counts NAMED values only |
| `hfa_area_only` (F10) | HFA, pre-aggregated area rows, **no** `facility_id` | the table-aware half of the sample-n gate — the family check alone would emit `COUNT(DISTINCT facility_id)` against a parquet without the column |
| `hfa_variants` (F11) | HFA, `hfa_variant_item` plain TEXT physical column, parent in `hfa_indicator`, **no admin column at all** | the generic physical-column path for group-by / filter / option lists; the blessed unfiltered scope case |
| `hmis_scorecard` (F12) | `denominator` is BOTH a PAE ingredient and a disaggregation option | the PAE groupBy/value-prop collision (`paeCollidingGroupBys`) — den=20 spans two rows so raw-binding (40/20 = 2) diverges from the correct aggregate binding (40/40 = 1) |
| `hfa_divergent_schema` (F13) | HFA module in a package carrying BOTH families' facilities, hmis slot's flags inverted and its rows carrying `wrong_family` types | the per-family structure-schema split: reading the hmis slot drops the facility join, reading the hmis parquet surfaces the wrong values |
| `hmis_admin3_only` (F14) | `admin_area_3` and **no** `admin_area_2`, with a facilities parquet | the scope DERIVATION — child areas resolved out of `facilities_hmis` by name |
| `admin3_no_family` (F15) | F14's shape, module sourced from upstream results objects, no facilities | the fail-CLOSED branch — the family, and with it the derivation, is undeclarable |
| `hmis_late_months` (F16) | `period_id` months 1, 10 and 12 | the quarter derivation's integer division — F1's months 1–3 carry a fraction too small to reach the quarter digit |

**F2/F3 are a minimal pair and the rig's central argument.** They differ in one
thing: `time_point`'s declared column type. The blank fold emits `trim()` and
returns a text sentinel from its `CASE`, neither of which either engine accepts
on a numeric column — so a name-only gate turns working visualizations into a
hard SQL error. Results-column types are authored per module, so the same
disaggregation option genuinely is text in one instance and integer in another.
No SQL-string assertion can see this class of bug; only execution can.

**F14/F15 are the same argument for scope.** They differ in whether the
derivation can run at all, and the two correct answers are opposite: filter by
the derived children, or return nothing.

## Out of scope

Valkey / `TimCacheC` (S3 machinery, another container); version-hash
byte-identity (a pure assertion needing no engine); the route-level Zod schema
(already a boundary schema); the run CATALOG row — `getReadyRunReadContext`'s
`status = 'ready'` gate is a route-level concern over the instance DB, and the
rig builds its contexts from packages on disk; the client tier.

## Anti-cruft contract

One rig, one case table. No `Deno.test`, no `deno task test` — a plain loop with
a pass/fail summary, so there is no gravity well for stray unit tests to
accumulate in. Coverage grows by adding rows, not files.
