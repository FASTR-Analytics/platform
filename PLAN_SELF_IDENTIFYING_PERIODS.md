# Plan: Self-identifying period values — remove the `periodOption` field (Phase 2)

## Prerequisite

`PLAN_QUARTER_ID_FORMAT_MIGRATION.md` (Phase 1) is **complete and deployed**:
`quarter_id` is `YYYYQ` (5-digit), physical columns and stored quarter filter
values are converted, and the three formats occupy disjoint ranges. **Do not start
this plan until that holds** — a 6-digit quarter value cannot be self-identified.

## First principles

After Phase 1, value ranges are disjoint by digit count, so a stored period value
**carries its own unit**. The `periodOption` tag (on `BoundedPeriodFilter`,
`PeriodBounds`, `fetchConfig`) is pure duplication of the metric's physical column,
and is removed. Every consumer derives format from the value via one helper.

| Format | Shape | Digits | Range |
|---|---|---|---|
| `year` | `YYYY` | 4 | 1900–2050 |
| `quarter_id` | `YYYYQ` | 5 | 19001–20504 |
| `period_id` | `YYYYMM` | 6 | 190001–205012 |

## The one helper

```ts
// lib — single source of the value→format relationship (post Phase 1).
// Returns undefined for invalid/degenerate values so callers guard explicitly;
// NEVER throws (it is called while building SQL).
export function inferPeriodFormatFromValue(v: number): PeriodOption | undefined {
  if (v >= 1900 && v <= 2050)     return "year";       // 4-digit
  if (v >= 19001 && v <= 20504)   return "quarter_id"; // 5-digit
  if (v >= 190001 && v <= 205012) return "period_id";  // 6-digit
  return undefined;
}
```

Use this **one** name everywhere (earlier drafts also floated `periodOptionFromValue`).

> The grouping/display `periodOption` (`timeseriesGrouping`, display `periodOpt`)
> is a separate, legitimate user choice ("group monthly data by quarter") and is
> **untouched** — it is not redundant with data format.

---

## Part A — Types & the helper

- **A1.** Add `inferPeriodFormatFromValue` to `lib` next to `isValidPeriodValue`
  ([_metric_installed.ts:70](lib/types/_metric_installed.ts#L70)).
- **A2.** Drop `periodOption` from `boundedFilterBase`
  ([_metric_installed.ts:85-89](lib/types/_metric_installed.ts#L85)). **Rework the
  `.refine`** ([:120-137](lib/types/_metric_installed.ts#L120)) — it currently
  destructures `periodOption` to call `isValidPeriodValue`. Replace with a tag-free,
  *stronger* check (rejects mixed-format bounds):
  ```ts
  const f = inferPeriodFormatFromValue(min);
  return f !== undefined && f === inferPeriodFormatFromValue(max) && min <= max;
  ```
- **A3.** `PeriodBounds` → `{ min, max }` (drop `periodOption`)
  ([presentation_objects.ts:63-67](lib/types/presentation_objects.ts#L63)). Under
  self-describing there is no carrier to keep — derive everywhere.
- **A4.** `GenericLongFormFetchConfig.periodFilterExactBounds` → `{ min, max }`
  ([presentation_objects.ts:398-410](lib/types/presentation_objects.ts#L398)). No
  new `fetchConfig.periodOption` carrier, no new `ResultsValueInfo` format field —
  both are unnecessary when the value self-identifies.
- **A5.** GitHub authoring schema: drop `periodOption` from
  [_module_definition_github.ts:101-105](lib/types/_module_definition_github.ts#L101)
  **and** the byte-identical `wb-fastr-modules/.validation/_module_definition_github.ts`
  (separate cross-repo PR). Don't leave a format field the runtime no longer reads.

## Part B — Creation sites (delete the `periodOption` write)

The value already carries the format, so just stop writing the field:

- [_2_filters.tsx](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx)
  — RadioGroup onChange ~298-303; onUpdate handlers ~373-378 / ~400-405 / ~431-437;
  transient `PeriodBounds` literals ~419-429; prop-type signatures ~552-553 / ~625-627 / ~818-819.
- [edit_common_properties_modal.tsx](client/src/components/visualization/edit_common_properties_modal.tsx)
  — `EditableFilter` ~25-33, `toPeriodFilter` ~39-44, init ~66, onChange ~126.
- [build_config_from_metric.ts:91-98](client/src/components/slide_deck/slide_ai/build_config_from_metric.ts#L91)
  and [visualization_editor.tsx:~195](client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx)
  (already source `mostGranular`; clean drop).
- [format_metric_data_for_ai.ts](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts)
  — `inferPeriodFilter` ~24-37, second constructor ~68-73; the conversion block
  ~64-75 becomes vacuous — **delete it**.
- [resolve_figure_from_metric.ts:76](client/src/components/slide_deck/slide_ai/resolve_figure_from_metric.ts#L76).
- `get_period_bounds.ts` `PeriodBounds` constructors (~57/99/118).
- **HMIS** [dataset_hmis.ts:420,507](server/db/instance/dataset_hmis.ts#L420): these
  are internal `PeriodBounds` literals (not PO filters) — delete the
  `periodOption: "period_id"` line; sole consumer
  [WindowingSelector.tsx:117](client/src/components/WindowingSelector.tsx#L117) reads min/max only.

## Part C — Consumption sites (read `inferPeriodFormatFromValue(min)`, not `.periodOption`)

- [get_fetch_config_from_po.ts](lib/get_fetch_config_from_po.ts):
  - `custom` branch ([:92-93](lib/get_fetch_config_from_po.ts#L92)) returns the
    stored filter `{min,max}` verbatim — fine, the value self-identifies.
  - **`from_month` branch ([:133-138](lib/get_fetch_config_from_po.ts#L133)) — FIX
    THE MIXED-SCALE BUG.** It returns `min: periodFilter.min` (stored) but
    `max: periodBounds.max` (live data max). If a legacy `from_month` min was
    authored in a different format than the live data, `inferPeriodFormatFromValue(min)`
    and `…(max)` disagree → broken filter. Guarantee both bounds are the same
    format: re-express `min` in the live-data format here, OR rely on the Part E
    migration to reconcile drifted `from_month` mins (census must confirm none remain).
  - `hashFetchConfig` ([:265-267](lib/get_fetch_config_from_po.ts#L265)): drop
    `filter.periodOption` from the key (min/max already in the hash; cache refills).
- [query_helpers.ts:226,237-238](server/server_only_funcs_presentation_objects/query_helpers.ts#L226):
  `periodColumn = inferPeriodFormatFromValue(min)` (guard `undefined`). The column
  may be **derived** — the existing `detectNeededPeriodColumns`/CTE machinery
  materializes `year`/`quarter_id` from `period_id` as needed.
- [period_helpers.ts:86 AND 95](server/server_only_funcs_presentation_objects/period_helpers.ts#L86):
  both reads → `inferPeriodFormatFromValue(value)`.
- **Replicant route** [presentation_objects.ts:660-666](server/routes/project/presentation_objects.ts#L660):
  derive format with `inferPeriodFormatFromValue(min)` and **stop trusting the
  client-supplied `periodOption`** ([:663](server/routes/project/presentation_objects.ts#L663)).
  `moduleId`/`resultsObjectId` are already in scope server-side
  ([:576-582](server/routes/project/presentation_objects.ts#L576)) — earlier drafts
  wrongly called this the "hardest site"; it's trivial.
- [get_possible_values.ts:32-36](server/server_only_funcs_presentation_objects/get_possible_values.ts#L32):
  bounds param keeps `{min,max}`; derive format locally. No `periodOption` param.
- Render / client reads (all → `inferPeriodFormatFromValue(min)`):
  [content_validators.ts:188-193](client/src/components/project_ai/ai_tools/validators/content_validators.ts#L188)
  (has `min` in scope — no new metric carrier needed),
  [get_figure_inputs_from_po.ts:378-382](client/src/generate_visualization/get_figure_inputs_from_po.ts#L378),
  [normalize_po_config.ts:56](lib/normalize_po_config.ts#L56),
  [format_metric_data_for_ai.ts:267](client/src/components/project_ai/ai_tools/tools/_internal/format_metric_data_for_ai.ts#L267),
  [format_viz_editor_for_ai.ts:56](client/src/components/project_ai/ai_tools/tools/_internal/format_viz_editor_for_ai.ts#L56),
  [visualization_editor_inner.tsx:230](client/src/components/visualization/visualization_editor_inner.tsx#L230),
  and the `_2_filters.tsx` / `edit_common_properties_modal.tsx` `keyedPeriodBounds.periodOption` reads.

## Part D — Delete reconcile

Delete `reconcilePeriodFilterWithBounds` + `periodIdToQuarterId` + the
`boundedFilter()` memo
([_2_filters.tsx:35-76, 235-238](client/src/components/visualization/presentation_object_editor_panel_data/_2_filters.tsx#L35));
use `rawPeriodFilter` directly. Confirm the slider `Math.max/Math.min` clamps
(~561-568, ~634) are untouched (clamping lives there, not in reconcile).

## Part E — Strip-tag cleanup migration (value-gated)

New block in [po_config.ts](server/db/migrations/data_transforms/po_config.ts)
**after** Phase 1's quarter block: `delete pf.periodOption` for bounded filters,
and reconcile any drifted `from_month`/`custom` `min`/`max` the census surfaced.

**Value-gate it — do NOT put it behind the `safeParse` skip at
[po_config.ts:325](server/db/migrations/data_transforms/po_config.ts#L325).** The
PO-config schema is a non-strict `z.object` that strips unknown keys on parse, so a
stale row with a leftover `periodOption` still `safeParse`-passes → the skip-gate
would silently miss exactly the rows to clean. Re-derive per row; idempotent
(absent tag → skip). Apply to every carrier of PO configs (see census).

## Part F — RO-granularity invariant (minimal defense-in-depth)

Self-identification heals the realistic drift (data became *finer*: a `year`
filter derives a year column from `period_id`). It does **not** cover the
*coarser* direction (a `period_id` filter on now-`year`-only data is
unsatisfiable). Guard that cheaply: in `run_module_iterator.ts` (where CSV-driven
granularity is materialized, ~L96/L422), probe the current `ro_` table's time
column before the DROP and **fail the run** if the emitted granularity differs.
Precedent: `hasComputeAffectingChanges` ([modules.ts:353](server/db/project/modules.ts#L353)).
**Do not** add a stored `results_objects.time_period_column` — it is net-new
surface for a now-non-load-bearing guard.

## Part G — Docs

[DOC_period_column_handling.md](DOC_period_column_handling.md): record the digit-length
scheme + `inferPeriodFormatFromValue`; remove the stale `legacy_po_config_adapter.ts`
references and the runtime-reconcile section; state the invariant — stored period
values carry their own unit; the metric's physical column names the data's format.

---

## Census gate (run before Part E)

Extend [diagnostic_period_filter_drift.ts](diagnostic_period_filter_drift.ts) to
sweep **all ~34 prod instances** AND **every PO-config carrier** (presentation
objects + slides + reports + dashboards), asserting `value-format == stored tag`
for each bounded filter. The "no reconcile needed" stance only holds if this comes
back clean (or with only finer-direction drift). Any coarser-direction or
mistagged row must be reconciled in Part E before the tag is dropped.

## Migration ordering (one coordinated deploy)

Phase 1's transforms (quarter value + physical column conversion) run first and are
already deployed. Within this deploy: **Part E runs after** Phase 1's quarter block;
code (A–D, F) ships together; docs (G) follow. The tag must survive until every
quarter value is 5-digit and every stored bound is reconciled — strip last.

## Testing

1. `deno task typecheck`.
2. Unit-test `inferPeriodFormatFromValue` at boundaries (2050 / 19001 / 20504 /
   190001 / 205012) and invalid gaps (2051, 20505).
3. Fresh install → custom filter at each granularity → correct SQL column.
4. **Drift regression** (Nigeria `fwv`): a `year` filter `2025` on `period_id` data
   derives a `year` column and still returns ~14M rows — no reconcile, no tag.
5. **`from_month` regression**: a `from_month` filter where stored min and live max
   would infer different formats resolves correctly (both bounds same format).
6. `.refine` rejects mixed-format bounds (`min` year, `max` period_id).
7. Replicant possible-values dropdowns filter by period with no client format trust.
8. Invariant: a module reinstall that changes RO granularity fails the run loudly.
9. Idempotency: re-running the Part E block is a no-op; cache (Valkey + IndexedDB)
   refills under the atomic deploy.
