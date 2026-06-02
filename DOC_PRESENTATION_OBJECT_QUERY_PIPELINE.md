# Presentation Object Query Pipeline

The SQL-assembly layer that turns a `GenericLongFormFetchConfig` into executed SQL: the `CTEManager` contract, the main + national-total query builders, aggregate and post-aggregation rewriting, the trusted-vs-escaped interpolation boundary, and the status/limit result envelope.

> **Scope discipline (this doc has the most overlap risk in the set):** period-column derivation, `QueryContext` time flags, period-CTE generation, `get_period_bounds`, and the period `WHERE` clause are owned by [DOC_period_column_handling.md](DOC_period_column_handling.md). Disaggregation semantics, `metric_enricher`, and `get_possible_values` are owned by [DOC_DISAGGREGATION_OPTIONS_HANDLING.md](DOC_DISAGGREGATION_OPTIONS_HANDLING.md). This doc owns only **SQL assembly/orchestration**. The `.unsafe()` SQL-safety *rule* is owned by [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md) — this doc documents only how that rule applies here. Results are cached as `po_items` keyed on `moduleLastRun` — [DOC_VALKEY_CACHE.md](DOC_VALKEY_CACHE.md).

---

## Principles

1. **All CTEs go through `CTEManager`.** It is the single sanctioned way to build the `WITH` clause so that `UNION ALL` (national totals) and post-aggregation wrapping stay syntactically valid and CTE names don't collide.
2. **Build, don't execute, in the helpers.** `buildCombinedQueryV2` returns a SQL string; the orchestrator runs it once via `projectDb.unsafe(...)`.
3. **Values are escaped; identifiers/expressions are trusted-internal.** Filter values go through escaping; column names, group-bys, value props, and the post-aggregation expression are interpolated raw because they come from closed unions or the module definition.
4. **Result size is a status, not an error.** Too-many-items / no-data are normal `status` values on a successful response, detected with an `N+1` limit probe.

---

## The System

```text
  getPresentationObjectItems(mainDb, projectId, projectDb, resultsObjectId, fetchConfig, …)
    │  results_objects → module_id ; tableName = ro_<uuid>
    ▼
  buildQueryContext(...)            ← time flags, facility-join needs, etc. (DOC_PERIOD / DOC_DISAGG)
  getPeriodBounds(...) → period bounds (DOC_PERIOD_COLUMN_HANDLING)
    ▼
  buildCombinedQueryV2({ tableName, fetchConfig, queryContext, limit: MAX_ITEMS + 1 })
    │  CTEManager.fromQueryConfig → period_data / facility_subset CTEs
    │  sourceTable = periodCTEName || tableName
    │  buildMainQuery  +  buildNationalTotalQueryV2  → UNION ALL
    │  applyPostAggregationExpressionV2  (split '=', div-by-zero NULLIF, wrap)
    │  emitWITHClause prepended ; LIMIT appended
    ▼
  projectDb.unsafe(sqlQuery)        ← single execution (DOC_DB_ACCESS_LAYER)
    ▼
  status envelope:
    rows > MAX_ITEMS  → "too_many_items"
    rows === 0        → "no_data_available"
    else              → "ok" (items + indicatorMetadata)
```

### `CTEManager` (`cte_manager.ts`)

- `register(name, definition)` — stores a CTE; **throws if the same name is registered with a different definition** (idempotent re-registration is allowed).
- `emitWITHClause()` — joins all registered CTEs into one `WITH …` clause (or `null` if none).
- `fromQueryConfig(config)` — the factory: registers a `period_data` CTE when `queryContext.needsPeriodCTE` (selecting the needed derived period columns) and a `facility_subset` CTE when a facility join with optional columns is needed; exposes `getPeriodCTEName()` / `getFacilityCTEName()`.

`buildCombinedQueryV2` (`get_combined_query.ts`) is the only place that assembles a full query: it builds the manager, picks `sourceTable = periodCTEName || tableName`, builds the main + national queries, `UNION ALL`s them, applies post-aggregation, prepends the `WITH`, and appends `LIMIT`.

### Main + national-total builders (`query_helpers.ts`)

- `buildMainQuery` selects `groupBys` + aggregate columns, grouping by `[...groupBys, ...identityValueProps]`, optionally `LEFT JOIN`ing the facility CTE (`f.<col>` prefixes).
- `buildNationalTotalQueryV2` returns a second query **only** when `includeNationalForAdminArea2 && groupBys.includes("admin_area_2") && !groupBys.includes("admin_area_3")`. It replaces `admin_area_2` with a sort-sentinel constant — `'__NATIONAL'` (position `"top"`) or `'zzNATIONAL'` (bottom) — drops `admin_area_2` from the `GROUP BY`, and `SUM`s the aggregates.
- `buildAggregateColumns`: an `identity` value → the bare `prop` (or `SUM(prop) AS prop` for the national total); any other `func` → `FUNC(prop) AS prop`.

### Post-aggregation (`applyPostAggregationExpressionV2`)

If `postAggregationExpression` contains `=`, split into `value = expression`, guard division with `/<col>` → `/ NULLIF(<col>, 0)`, and wrap: `SELECT <groupBys>, (<safeExpression>) as <value> FROM (<query>) AS subq`. The expression comes from the module definition (trusted).

### WHERE clause (`buildWhereClause`) — the escaping boundary

This is where filter *values* are made safe:
- integer columns (`year`, `month`, `quarter_id`, `period_id`, `time_point`) → `Number(v)` coercion, `col IN (n, …)`;
- text columns → `UPPER(col) IN ('VAL', …)` with values upper-cased and `''`-doubled;
- period bounds → `<periodColumn> >= <min>` / `<= <max>`.

(The period-bounds half is documented in [DOC_period_column_handling.md](DOC_period_column_handling.md).)

### The trusted-vs-escaped boundary (applied from [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md))

| Interpolated into `.unsafe()` SQL | Source | Handling |
|-----------------------------------|--------|----------|
| filter **values** | user/AI input | **escaped** (`buildWhereClause`: numeric coercion or `UPPER`+`''`-doubling) |
| `disOpt` / column names | `DisaggregationOption` closed union | trusted (not user free-text) |
| `groupBys`, period options | closed unions | trusted |
| value `prop` / `func` | module definition | trusted |
| `postAggregationExpression` | module definition | trusted (only NULLIF-rewritten) |
| national sentinel codes | server constants | trusted |

The **rule** (which fields may be raw, which must be escaped) is owned by [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md); this table is its application to this pipeline.

### Status / limit envelope

`getPresentationObjectItems` runs inside `tryCatchDatabaseAsync` and fetches `MAX_ITEMS + 1` rows. `> MAX_ITEMS` → `too_many_items`; `0` rows (or unresolvable period bounds) → `no_data_available`; otherwise `ok` with `items` + `indicatorMetadata`. Every branch returns `{ success: true, data: ItemsHolderPresentationObject }` — the size states are data, not errors.

---

## Rules

1. **Build CTEs through `CTEManager`.** Don't hand-write `WITH period_data AS (...)` / `facility_subset AS (...)` strings — register them so names and definitions can't conflict across the `UNION ALL`.
2. **Assemble full queries via `buildCombinedQueryV2`.** Main + national + post-aggregation + `WITH` + `LIMIT` ordering is load-bearing (CTEs must stay at the top level even after post-aggregation wrapping).
3. **Escape filter values via `buildWhereClause`.** All user/AI-supplied filter values route through it; never interpolate a filter value elsewhere.
4. **Keep raw-interpolated fields trusted-internal.** `disOpt`/column/`prop`/`postAggregationExpression` may be raw *only* because they're closed unions or module-definition-sourced — see [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md).
5. **Return a status, not a throw, for size states.** `too_many_items` / `no_data_available` are `status` values.

---

## What NOT to do

- **Don't hand-write CTEs outside `CTEManager`.** `get_possible_values` and `get_period_bounds` currently build their own `WITH period_data` / `facility_subset` strings (and always derive all three period columns regardless of need), duplicating the CTE names and join shape — which breaks on `quarter_id`-only tables. New CTE construction must go through `CTEManager`.
- **Don't interpolate a filter value without `buildWhereClause`** — that's the only escaping path.
- **Don't assume `postAggregationExpression` is safe to interpolate from anywhere but the module definition** — its trust rests on its source.
- **Don't surface a size state as an `err`** — the client distinguishes `too_many_items`/`no_data_available`/`ok`.

---

## Gotchas

- **`N+1` probe.** The query fetches `MAX_ITEMS + 1` precisely so `length > MAX_ITEMS` flags overflow without a separate `COUNT`.
- **National sentinels are sort hacks.** `__NATIONAL` (sorts first) / `zzNATIONAL` (sorts last) are string sentinels in the `admin_area_2` column, not real admin areas — downstream rendering knows to special-case them.
- **Post-aggregation moves CTEs outward.** `applyPostAggregationExpressionV2` wraps the query in a subquery; `buildCombinedQueryV2` prepends the `WITH` *after* that wrap so CTEs stay top-level. Reordering breaks the SQL.
- **`getPeriodBounds`/possible-values bypass `CTEManager`** — so the CTE shape exists in three places and can drift (see enforcement).
- **`module_id` / `last_run` are resolved more than once** — the route and the function each re-query them.

---

## Enforcement opportunities

- **Route all CTE construction through `CTEManager`** — migrate `get_possible_values` and `get_period_bounds` off their hand-written `WITH` strings (fixes the `quarter_id`-only-table drift).
- **State + ideally validate the trusted-input invariant** for raw-interpolated identifiers/expressions (`validateFetchConfig` checks shapes/enums but not that `prop`/`postAggregationExpression` are safe identifiers). Delegate the rule to [DOC_DB_ACCESS_LAYER.md](DOC_DB_ACCESS_LAYER.md).
- **One canonical resolution path** `resultsObjectId → module_id → moduleLastRun`; remove the duplicate round-trips.
- **Uniform error/status contract for the possible-values resolvers** — the same missing-column failure becomes `{ success: false }` in one caller, a silently-skipped `disOpt` in another, and `no_values_available` in a third.
- **Drop the dead "identical to v1" vocabulary** and the commented-out backward-compat function (no v1 exists) — declare the V2 builders authoritative.

---

## Tracing/changing a query — checklist

- [ ] New derived columns / joins → register a CTE via `CTEManager.fromQueryConfig` (or `register`), never a hand-written `WITH`
- [ ] Filter values flow through `buildWhereClause`
- [ ] Raw-interpolated fields are closed unions or module-definition-sourced (else escape them)
- [ ] Full assembly goes through `buildCombinedQueryV2` (preserve CTE/post-aggregation/`LIMIT` ordering)
- [ ] Size/empty outcomes returned as `status`, wrapped in `tryCatchDatabaseAsync`
- [ ] Period/disaggregation specifics deferred to their owning docs

---

## Key files

| File | Purpose |
|------|---------|
| `server/server_only_funcs_presentation_objects/get_presentation_object_items.ts` | orchestrator + status envelope |
| `server/server_only_funcs_presentation_objects/cte_manager.ts` | `CTEManager` (the only sanctioned CTE builder) |
| `server/server_only_funcs_presentation_objects/get_combined_query.ts` | `buildCombinedQueryV2` assembly |
| `server/server_only_funcs_presentation_objects/query_helpers.ts` | main/national builders, `buildWhereClause`, aggregates, post-aggregation |
| `server/server_only_funcs_presentation_objects/get_query_context.ts` | `QueryContext` (time/facility flags — see DOC_PERIOD/DOC_DISAGG) |
| `server/server_only_funcs_presentation_objects/consts.ts` | `MAX_ITEMS` |
| `server/db/project/results_value_resolver.ts`, `metric_enricher.ts` | metric resolution feeding the config |
