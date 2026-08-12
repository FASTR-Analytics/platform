# PROTOCOL — App: The Query Test Rig

> **App-specific authoring protocol** (not panther's cross-project
> `PROTOCOL_*`). This is the _recipe_ — read it when **adding a case** to the
> S9 query rig or changing SQL assembly. The query pipeline's ownership and
> architecture belong to **S9** — see `SYSTEM_09_viz_query_cache.md`; this file
> is the how-to. Sibling rig: `./validate_migrations`
> (`PROTOCOL_APP_MIGRATIONS.md`).

---

## What it is

`./validate_queries` stands up a throwaway Postgres, loads the **real** base
schema files, seeds declarative fixtures, and runs the **production** query
machinery in `server/server_only_funcs_presentation_objects/` against them.
Config → SQL → real rows. Nothing is mocked and there is no test seam: the
entry points already take `Sql` handles as parameters, so the rig just hands
them connections to its own container.

```bash
./validate_queries            # ~6s: container up, 12 fixtures, 60 cases
```

(~6s once the `postgres:17.4` image is cached locally; the first run pulls it.)

Also offered as an optional prompt in `./deploy`, next to migration validation.
**Not** in `deno task typecheck` — not because it is slow, but because it needs
a running Docker daemon, and the typecheck gate must work without one. The rig
typechecks itself before running, since `query_rig/` sits outside
`lint_systems`' tracked globs.

| File | Role |
| --- | --- |
| `validate_queries` | container lifecycle, env, invokes the runner |
| `query_rig/mod.ts` | runner: prepare fixtures, loop cases, summarise |
| `query_rig/cases.ts` | **the case table** — where you add coverage |
| `query_rig/fixtures.ts` | F1–F10 |
| `query_rig/seed.ts` | fixture → SQL |
| `query_rig/harness.ts` | connections, schema loading, multiset compare |

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
- `calendar: "ethiopian"` flips `setCalendar()` for that case —
  `getQuarterIdExpression` emits different SQL per calendar.
- `entry: "possibleValues"` with `disOpt` runs the option-list query instead of
  the items query, reusing `fetchConfig.filters` as the filter set.
- `entry: "metricInfo"` resolves the fixture's `metric` through the enricher and
  asserts a `dimStatus`: `status`, `namedCount` (sentinel excluded), and
  `isSingleValueDim` (which runs the real
  `getSingleValueDimsFromPossibleValues` over the whole payload). Requires the
  fixture to declare a `metric`.

## Adding a fixture

Only when no existing fixture can express the shape — a different physical time
column, a missing `facility_id`, a different **column type**. Fixtures are
synthetic and small — 2–8 hand-designed rows sitting on semantic edges. Never
seed from a dump: it can't be committed and it makes assertions drift. The one
exception is F9, which generates 501 rows because the behaviour under test _is_
a 500-row boundary; generate rather than enumerate when the count is the point.

`ro_*` tables are dynamic in production (built by run_module from CSV headers),
so each fixture declares `roColumns` **with explicit types**. The types are
load-bearing, not decoration — see the F2/F3 pair below.

## Rules that keep the rig honest

**Rows compare as a multiset.** The queries carry no `ORDER BY`, so
sequence comparison is flaky by construction. `harness.ts` canonicalises before
comparing. Option lists are the exception — there, order _is_ the assertion.

**Assert what our code guarantees, not what the database happens to do.** The
`possibleValues` cases pin the sentinel in the **last** position because TS puts
it there; the relative order of the named values is Postgres collation under the
pinned `postgres:17.4` image. If a base-image bump reshuffles those, it is a
collation change, not a regression.

**Design numbers so a wrong implementation cannot coincidentally pass.** The
roll-up PAE case uses 60/200 and 20/800 precisely because mean-of-ratios
(0.1625) and the correct recompute-after-union (80/1000 = 0.08) diverge. Equal
numbers would have proved nothing.

**Reproduce the route's sequence, not just the query function.**
`validateFetchConfig` runs in the **handler**, not inside
`getPresentationObjectItems` — the runner calls it explicitly. Skip it and every
SQL-safety case silently becomes a no-op.

**Never encode behaviour you have not judged.** When a case fails, the default
assumption is that the _code_ is wrong, not the expectation. Only pin observed
behaviour after confirming it is intended, and say so in a comment with the
reason. Two live examples:

- `rollupDim` absent from `groupBys` does not error —
  `buildRollupQuery` returns `null` and the roll-up row is
  silently omitted. Intended: those checks are the SQL-safety boundary, and the
  client owns the collapse decision (S9). The case pins the contract; it does
  not bless the silence.
- The `quarter_id` + calendar-filter block in `getPeriodFilterExactBounds` looks
  dead and is not. Deleting it turns "show all data" into `no_data_available`.

**Prove a new guard's case can fail.** Passing tests prove nothing on their own.
Temporarily break the mechanism, confirm the case goes red, then restore.
Verified controls so far:

| Break | Expected failure |
| --- | --- |
| `shouldFoldBlank` → name-only gate | F3: `function btrim(integer, unknown) does not exist` |
| `exceedsMaxReplicantOptions` → count all values | F9 500-case: `ok` → `too_many_values` |
| drop the multi-membership skip in `getSingleValueDimsFromPossibleValues` | F8: `isSingleValueDim=false` → `true` |
| `emitsSampleN` → family-only gate (drop `hasFacilityId`) | F10: `column ro_….facility_id does not exist` |
| `COUNT(DISTINCT facility_id)` → `COUNT(facility_id)` | 4 cases: n reports rows (4/4/8) instead of facilities (2/3/5) |
| drop `sourceTable.` from the value aggregates (buildAggregateColumns) | both Ghana-shape cases: `column reference "facility_id" is ambiguous` |
| drop `sourceTable.` from the plain-values sample-n FILTER | HFA Ghana-shape case only: same ambiguity error |
| wrapper `groupByPrefix` → plain join (no collision re-alias) | both F12 PAE cases: `column reference "denominator" is ambiguous` |
| disable the non-PAE value-prop guard in `validateFetchConfig` | F12 boundary case: expected error, got success (silent key clobber) |
| disable buildWhereClause's numeric filter branch | both F12 filter cases: `function upper(numeric) does not exist` |
| drop the PERIOD exclusion from the numeric filter gate | month-filter case: derived TEXT month misrouted to `month IN (2)` |

Check `git status` on the file first and restore by copy if it has uncommitted
changes — `git checkout` would discard parallel work.

## The fixtures

| Fixture | Shape | Exists for |
| --- | --- | --- |
| `hmis_monthly` (F1) | HMIS, physical `period_id`, facility rows | general grouping, blank-fold specimens (`NULL`, spaces, tab, and the `'x'`/`' x'` pair), derived month/quarter/year |
| `hfa_service_cats` (F2) | HFA, `hfa_service_category` pipe-joined sets, `time_point` **text** | multi-membership, blank fold on text |
| `hfa_timepoint_integer` (F3) | F2 with `time_point` **integer** | the type gate — see below |
| `hmis_ratio` (F4) | facility rows + `num`/`den` | PAE roll-up, AVG eligibility (allowed) |
| `hmis_area_only` (F5) | pre-aggregated areas, **no** `facility_id` | AVG eligibility (refused) |
| `hmis_quarterly` (F6) | physical `quarter_id` | derives `year`, never `month` |
| `hmis_yearly` (F7) | physical `year` | derives nothing |
| `hfa_facility_blanks` (F8) | NULL facility cell + a results row with no facilities row | the fold reaches joined facility columns, from both blank origins; single-member set column |
| `hmis_option_cap` (F9) | 500 named + blank / 501 named | the option-list cap counts NAMED values only |
| `hfa_area_only` (F10) | HFA, pre-aggregated area rows, **no** `facility_id` | the table-aware half of the sample-n gate — the family check alone would emit `COUNT(DISTINCT facility_id)` against a table without the column |
| `hfa_variants` (F11) | HFA, `hfa_variant_item` plain TEXT physical column, parent in `hfa_indicator` | the generic physical-column path for group-by / filter / option lists on the variants dimension |
| `hmis_scorecard` (F12) | `denominator` is BOTH a PAE ingredient and a disaggregation option | the PAE groupBy/value-prop collision (`paeCollidingGroupBys`) — den=20 spans two rows so raw-binding (40/20 = 2) diverges from the correct aggregate binding (40/40 = 1) |

**F2/F3 are a minimal pair and the rig's central argument.** They differ in one
thing: `time_point`'s declared column type. The blank fold emits `btrim()` and
returns a text sentinel from its `CASE`, both of which Postgres rejects on a
numeric column — so a name-only gate turns working visualizations into a hard
SQL error. Results-column types are authored per module, so the same
disaggregation option genuinely is text in one instance and integer in another.
No SQL-string assertion can see this class of bug; only execution can.

## Out of scope

Valkey / `TimCacheC` (S3 machinery, another container); version-hash
byte-identity (a pure assertion needing no DB); the route-level Zod schema
(already a boundary schema); the client tier.

## Anti-cruft contract

One rig, one case table. No `Deno.test`, no `deno task test` — a plain loop with
a pass/fail summary, so there is no gravity well for stray unit tests to
accumulate in. Coverage grows by adding rows, not files.
