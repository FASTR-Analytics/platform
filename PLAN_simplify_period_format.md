# Plan: simplify period format handling — one source of truth

## Status: DRAFT (review carefully)

## Goal

Eliminate the duplication of period format information across `PeriodBounds` and `BoundedPeriodFilter`. Make the metric's inferred `mostGranularTimePeriodColumnInResultsFile` the **single source of truth** for period format. Delete the runtime reconciliation logic that defends against a scenario that doesn't happen in practice (a results object's period format changing while POs remain).

## Premise (this is load-bearing — sanity-check it before implementing)

**A results object's period format does not change during the life of its POs.** If a module author rewrites their R script to output a different time granularity, everything about existing POs is broken: disaggregations reference missing columns, `timeseriesGrouping` may be invalid, the whole viz needs re-authoring. Filter reconciliation fixes one symptom of a larger breakage — it doesn't restore correctness. If this premise ever changes, we revisit.

Corollary: the `periodOption` field on a stored filter always equals the data's format (at least at authoring time, which is forever given the premise). It carries no information not already on the metric.

## What becomes simpler

- No `reconcilePeriodFilterWithBounds` — gone entirely.
- No filter.periodOption in the type — stored filters are just `{filterType, min, max}`.
- No data-bounds.periodOption in the type — bounds are just `{min, max}`.
- `mostGranularTimePeriodColumnInResultsFile` on the enriched `ResultsValue` is the only place format is stored.
- Fewer places to reason about "whose periodOption is this?" in the filter pipeline.

## What we're accepting as a cost

Legacy stored data with a mismatched `periodOption` (from old bugs — the bounded filter case is rare; most historical mismatches were on relative filters where our adapter already strips the redundant fields) will produce broken SQL after this change. Options within this plan:

1. **Accept the breakage as an edge case.** Users notice an empty chart, re-author the filter. Simplest.
2. **One-time reconcile migration.** JS startup migration (Pattern 4 in DOC_legacy_handling.md): for every PO config with a bounded filter, query current data bounds and reconcile the filter's min/max to match. Writes the fixed config back. Then adapter drops stale `periodOption` fields at every read going forward.

Recommend (2) if we can justify the effort, (1) if diagnostics show the bounded-filter mismatch case is effectively nonexistent in production.

## Design

### Type changes

```ts
// Before
export type PeriodBounds = { periodOption: PeriodOption; min: number; max: number };
export type BoundedPeriodFilter = { filterType: "custom" | "from_month"; ... } & PeriodBounds;

// After
export type PeriodBounds = { min: number; max: number };
export type BoundedPeriodFilter = {
  filterType: "custom" | "from_month";
  nMonths?: number;
  nYears?: number;
  nQuarters?: number;
  min: number;
  max: number;
};
```

`PeriodOption` as a standalone type stays (enum `"period_id" | "quarter_id" | "year"`). It's only attached to the metric (`ResultsValue.mostGranularTimePeriodColumnInResultsFile`).

### `getPeriodFilterExactBounds` signature

Currently returns `PeriodBounds` (with format tag). After: returns `{min, max}`. Callers that need the format must also pass the metric's `mostGranular` and use that.

Alternative if we want minimal ripple: keep returning `{min, max}` but create a new helper that wraps it plus the metric's format for downstream. Decide which during implementation.

### `fetchConfig.periodFilterExactBounds`

Today: `{periodOption, min, max}`. Consumers like [query_helpers.ts:219](server/server_only_funcs_presentation_objects/query_helpers.ts#L219) read `.periodOption` to pick the SQL column. After: the fetchConfig carries metric-level `periodOption` separately (or query_helpers reads from the metric context already available in buildQueryContext).

Need to decide: do we keep a `periodOption` field on `fetchConfig` (pulled from the metric, so it's a single-source-of-truth projection, not a duplication), or do we thread it separately through every call?

My inclination: **add `periodOption: PeriodOption | undefined` to `GenericLongFormFetchConfig` once, at the top level, sourced from `mostGranular` at fetchConfig construction.** Consumers read it from there. Not a duplication because there's one write and many reads — same as any derived data.

### HMIS filter usage

[server/db/instance/dataset_hmis.ts:420,507](server/db/instance/dataset_hmis.ts#L420) constructs a PeriodFilter-shaped record with hardcoded `periodOption: "period_id"`. These are internal to HMIS query logic, not user-facing PO filters. Update to the new type shape (drop periodOption) OR if HMIS logic depends on the format tag, keep HMIS filters as their own internal type distinct from `PeriodFilter`. Audit needed.

## Changes

### Part A — Type changes

**A1.** [lib/types/presentation_objects.ts:90-108](lib/types/presentation_objects.ts#L90) — redefine `PeriodBounds` as `{min, max}` and `BoundedPeriodFilter` as `{filterType, min, max, nMonths?, nYears?, nQuarters?}`. `periodFilterHasBounds` type guard remains.

**A2.** [lib/types/module_definition_validator.ts](lib/types/module_definition_validator.ts) — update Zod schemas for `periodFilter`:
- `boundedPeriodFilter`: drop `periodOption` field.

**A3.** Update `GenericLongFormFetchConfig` (wherever defined — grep `GenericLongFormFetchConfig`) to add a top-level `periodOption?: PeriodOption` field.

### Part B — Filter creation sites

Every site constructing a `BoundedPeriodFilter` today passes `periodOption`. Remove it.

- [_2_filters.tsx:~285](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) — RadioGroup onChange for custom/from_month
- [_2_filters.tsx:~363,~394,~423](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) — onUpdate handlers for the three custom UIs
- [edit_common_properties_modal.tsx](client/src/components/visualization/edit_common_properties_modal.tsx) — `toPeriodFilter` + init + onChange
- [format_metric_data_for_ai.ts](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts) — `inferPeriodFilter` returns `{filterType: "custom", periodOption, min, max}` today; drop periodOption
- [build_config_from_metric.ts](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts) — custom filter constructor
- [visualization_editor.tsx](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx) — custom filter constructor
- [dataset_hmis.ts](server/db/instance/dataset_hmis.ts) — audit; if HMIS filters are internal and not PO filters, may keep a local type with periodOption, or drop if consumer doesn't need it

### Part C — Filter consumption sites

Every site reading `BoundedPeriodFilter.periodOption` today must be changed to read from the metric's `mostGranular...ResultsFile` instead.

- [get_fetch_config_from_po.ts:97-99](lib/get_fetch_config_from_po.ts#L97) — `getPeriodFilterExactBounds` "custom" branch returns `periodFilter` as-is today; signature changes per design.
- [get_fetch_config_from_po.ts:285](lib/get_fetch_config_from_po.ts#L285) — cache-key builder reads `periodFilter.periodOption`. Drop it (format is implicit); or update to read fetchConfig.periodOption. Cache-key change invalidates old entries — acceptable.
- [content_validators.ts:193,218,219,223](client/src/components/project_ai/ai_tools/validators/content_validators.ts) — AI validator type. Audit: does it need the format? Probably reads it from bounds which comes from metric; use that.
- [visualization_editor.tsx:86](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx#L86) — display-only, can use metric's format.
- [resolve_figure_from_metric.ts:76](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts#L76) — constructor passing format through; use metric's format.

### Part D — `PeriodBounds` consumers

Everywhere that reads `periodBounds.periodOption` must read `mostGranular...ResultsFile` instead.

- [get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts) — `getPeriodFilterExactBounds` branches on `periodBounds.periodOption`. Pass metric's `mostGranular` in instead, or inline the equivalence since they're the same value.
- [query_helpers.ts:219](server/server_only_funcs_presentation_objects/query_helpers.ts#L219) — uses `fetchConfig.periodFilterExactBounds.periodOption`. Read from `fetchConfig.periodOption` (new field).
- [period_helpers.ts:64-75](server/server_only_funcs_presentation_objects/period_helpers.ts#L64) — same.
- [get_possible_values.ts:29](server/server_only_funcs_presentation_objects/get_possible_values.ts#L29) — same.
- [get_period_bounds.ts](server/server_only_funcs_presentation_objects/get_period_bounds.ts) — constructs `PeriodBounds` with `periodOption`. Changes to return `{min, max}`.
- UI: [_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx) uses `p.keyedPeriodBounds.periodOption` widely. Source this from the metric's `mostGranular` instead. (`keyedPeriodBounds` becomes `{min, max}`.)
- [edit_common_properties_modal.tsx](client/src/components/visualization/edit_common_properties_modal.tsx) — same pattern.

### Part E — Delete reconcile

**E1.** Delete `reconcilePeriodFilterWithBounds` from [_2_filters.tsx:30-58](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L30).

**E2.** Delete `boundedFilter()` memo in the Show block and inline uses — just use `rawPeriodFilter` directly.

**E3.** Delete the "runtime alignment" section from [DOC_period_column_handling.md](DOC_period_column_handling.md).

### Part F — Legacy adapter

Option F1 — accept breakage:

Update [server/db/project/legacy_po_config_adapter.ts](server/db/project/legacy_po_config_adapter.ts) to unconditionally drop `periodOption`, `min`, `max` from relative filters (already does) AND drop `periodOption` from bounded filters (new). `min` and `max` are preserved.

Risk: a bounded filter with stored `periodOption` differing from current data format will produce broken SQL.

Option F2 — one-time reconcile migration:

Add a JS startup migration (Pattern 4). For each project:
1. Load each PO config with a bounded filter.
2. Fetch current data bounds for the metric.
3. If filter's periodOption differs from metric's mostGranular, run the (soon-deleted) `reconcilePeriodFilterWithBounds` logic to convert min/max.
4. Write the fixed config back (dropping periodOption).

MIGRATION_ID: `js_migrate_drop_filter_periodoption_YYYY_MM`.

After the migration, the adapter (Option F1) safely drops leftover `periodOption` fields.

### Part G — Update DOC

Rewrite period-filter-related sections in [DOC_period_column_handling.md](DOC_period_column_handling.md):

- Remove "filter's periodOption may differ" discussion.
- Remove "runtime alignment" / reconcile section.
- Note that `mostGranular...ResultsFile` is the single source of truth for period format; bounds and filters carry only numbers.

Update [DOC_legacy_handling.md](DOC_legacy_handling.md):

- Add the new adapter behavior (strip `periodOption` from bounded filters).
- If F2 chosen, document the one-time migration.

## Things to verify before implementing — "am I missing something?"

1. **HMIS filter logic**: does [dataset_hmis.ts](server/db/instance/dataset_hmis.ts) depend on the `periodOption` field of its internal filter object for anything beyond the hardcoded `"period_id"`? If HMIS is its own subsystem with no relation to PO filters, factor into its own local type and don't mix with PO types.

2. **Panther (`@timroberton/panther`)**: does any panther-side code consume `periodOption` off a filter or bounds? Panther is external and shouldn't be modified. Check for consumers.

3. **`periodFilterExactBounds` on `fetchConfig`**: who writes this field? Who reads it? Every reader needs to shift from reading `.periodOption` to reading the new top-level `fetchConfig.periodOption`.

4. **AI validator and prompts**: do any AI validator schemas or prompt strings mention `periodOption`? AI needs to understand the shape it's producing. If validators enforce the old shape, update them. If prompts describe filters using periodOption, update descriptions.

5. **Report / slide code**: are report items or slides persisting bounded filters with `periodOption`? If so, they need the same adapter treatment.

6. **Cache-key change**: removing `periodOption` from the hash function invalidates Valkey entries. Acceptable (fill-on-next-request).

7. **API contracts**: if any API response type is `PeriodBounds`, client code reading the response may expect `periodOption`. Check client-server type symmetry.

8. **Test data / fixtures**: any fixtures or test JSON with `periodOption` on bounds/filters? Update or let the adapter handle.

9. **What the premise ACTUALLY rules out**: "data format doesn't change" means for a given results_object_id. It's possible for a NEW module with the same metric IDs to be installed — but that's effectively a different dataset. POs referencing the old data would break regardless.

10. **The `last_calendar_year` / `last_calendar_quarter` legacy filterTypes**: these still exist in the type union. After this refactor they're still supported. Verify they don't have bounded-shape expectations anywhere.

11. **The `reconcilePeriodFilterWithBounds` function also did format conversion (year → period_id etc.)**: is there any other caller benefiting from that conversion that I'm not catching by just looking at the filter UI? Grep `reconcilePeriodFilterWithBounds` and `convert` in the same file.

12. **Server-side`periodFilterHasBounds`**: the type guard. After refactor it still works because `filterType === "custom" | "from_month"` discriminator is unchanged. Double-check.

## Testing

1. `deno task typecheck` passes after each part.
2. Fresh install of a module, author a timeseries with a custom filter, verify correct SQL is generated.
3. Existing project with stored bounded filters (pre-refactor shape): confirm adapter drops `periodOption`, query still works.
4. If F2 migration path chosen: verify migration runs once, reconciles stored filters, and the migration flag prevents re-run.
5. HMIS queries: check period filter still works (data goes to correct column).
6. AI slide builder end-to-end: generate a slide with a custom time filter, verify it applies correctly.
7. Cache warm: after deploy, first request fills cache with new shape; subsequent requests use it.

## Rollout ordering

Sequential (all in one coordinated deploy since types change):

1. Part A (type changes — breaks everything until other parts done).
2. Parts B, C, D, E, F in any order — they're all "fix up sites touched by A".
3. Part G (doc updates).

Not incremental-friendly — type changes don't land cleanly partway. One atomic refactor.

## Open questions for review

- **F1 or F2?** (Accept breakage vs one-time migration.) F2 is more defensive but adds work. F1 is simpler if we believe no production filters are in the mismatched state.
- **Keep `periodOption` on computed `periodFilterExactBounds` as self-description?** Or strictly just `{min, max}` and caller threads the format? My current leaning: keep on computed bounds as a `{periodOption, min, max}` projection (derived, always from metric), to avoid threading format through every caller. This maintains some ergonomics while making the filter-side clean. If you want maximum purity, strip it here too.
- **Are there consumers I haven't enumerated?** The "am I missing something?" section above lists the audit areas. Implementation should actually run those greps and verify, not just trust this plan.
