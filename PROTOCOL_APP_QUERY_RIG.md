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
./validate_queries            # ~30s: container up, 7 fixtures, 31 cases
```

Also offered as an optional prompt in `./deploy`, next to migration validation.
Deliberately **not** in `deno task typecheck` — container spin-up plus seeding
is too slow for the fast gate. The rig typechecks itself before running, since
`query_rig/` sits outside `lint_systems`' tracked globs.

| File | Role |
| --- | --- |
| `validate_queries` | container lifecycle, env, invokes the runner |
| `query_rig/mod.ts` | runner: prepare fixtures, loop cases, summarise |
| `query_rig/cases.ts` | **the case table** — where you add coverage |
| `query_rig/fixtures.ts` | F1–F7 |
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
  "too_many_items"}`, `{values}` (option lists, **ordered**), or `{err}`
  (substring match).
- `calendar: "ethiopian"` flips `setCalendar()` for that case —
  `getQuarterIdExpression` emits different SQL per calendar.
- `entry: "possibleValues"` with `disOpt` runs the option-list query instead of
  the items query, reusing `fetchConfig.filters` as the filter set.

## Adding a fixture

Only when no existing fixture can express the shape — a different physical time
column, a missing `facility_id`, a different **column type**. Fixtures are
synthetic and small (2–8 rows), hand-designed to sit on semantic edges. Never
seed from a dump: it can't be committed and it makes assertions drift.

`ro_*` tables are dynamic in production (built by run_module from CSV headers),
so each fixture declares `roColumns` **with explicit types**. The types are
load-bearing, not decoration — see the F2/F3 pair below.

## Rules that keep the rig honest

**Rows compare as a multiset.** The queries carry no `ORDER BY`, so
sequence comparison is flaky by construction. `harness.ts` canonicalises before
comparing. Option lists are the exception — there, order *is* the assertion.

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
assumption is that the *code* is wrong, not the expectation. Only pin observed
behaviour after confirming it is intended, and say so in a comment with the
reason. Two live examples:

- `adminAreaRollupLevel` absent from `groupBys` does not error —
  `buildAdminAreaRollupQuery` returns `null` and the `__NATIONAL` row is
  silently omitted. Intended: those checks are the SQL-safety boundary, and the
  client owns the collapse decision (S9). The case pins the contract; it does
  not bless the silence.
- The `quarter_id` + calendar-filter block in `getPeriodFilterExactBounds` looks
  dead and is not. Deleting it turns "show all data" into `no_data_available`.

**Prove a new guard's case can fail.** Passing tests prove nothing on their own.
Temporarily break the mechanism and confirm the case goes red. `shouldFoldBlank`
weakened to a name-only gate must make the F3 case fail with
`function btrim(integer, unknown) does not exist`; restore afterwards.

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
