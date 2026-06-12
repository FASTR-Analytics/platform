# PLAN: Admin-area rollup fixes

Source: full multi-agent review of the rollup feature (2026-06-10), 36 verified findings.
All four design decisions below are locked (agreed with Tim):

1. **Eligibility gated by value semantics** — rollup offered only when `valueFunc` is `SUM`/`COUNT`, or `identity` WITH a `postAggregationExpression`. Bare identity (m7 scorecards) and AVG/MIN/MAX (m6 coverage) become ineligible.
2. **Honest relabeling** — keep the row under filters; label walks ALL coarser admin levels: pinned single value → "{Area} — Total"; any admin filter with 2+ values at/above the rollup level → "Total (selected areas)"; otherwise "National".
3. **Single sentinel** — position becomes sort-only; drop `adminAreaRollupPosition` from the fetch config, hash, and validator. Top/bottom toggle no longer changes SQL or cache keys.
4. **m006 presets drop the rollup** — m6-01-01 already provides the real national estimate.

Out of scope (separate backlog, do NOT do here):

- Hardening the pre-existing fetch-config API boundary (raw interpolation of `groupBys`/`values[].prop`/`postAggregationExpression`; `getReplicantOptions` skipping validation). Pre-dates the feature.
- Full AI data parity (plumbing rollup rows into `AiMetricQuery`). Phase 6 does the lean fix only.
- Panther-side fixes beyond the one pin-only sort extension in Phase 4.1 (e.g. index-keyed series colors). Panther changes happen in its own repo and resync — never here. (Note: the review's "sortIndicatorValues truthiness quirk" was re-investigated and is NOT a quirk — see Phase 4.1.)

---

## Phase 1 — lib core

### 1.1 Single sentinel (`lib/admin_area_rollup.ts`)

- Replace `ROLLUP_SENTINEL_TOP`/`ROLLUP_SENTINEL_BOTTOM` with one `ROLLUP_SENTINEL = "__NATIONAL"`.
- Keep `LEGACY_ROLLUP_SENTINEL = "zzNATIONAL"` exported, marked as legacy-render-compat only (stored FigureInputs grids may contain it for one release). Nothing new ever emits it.
- Update the header comment: position is a client sort preference, not a data concern.

### 1.2 Metric eligibility (`lib/admin_area_rollup.ts` + `lib/get_fetch_config_from_po.ts`)

- New predicate in `admin_area_rollup.ts`:
  `isRollupEligibleResultsValue(rv: { valueFunc: ValueFunc; postAggregationExpression?: PostAggregationExpression | null }): boolean`
  → true iff `rv.postAggregationExpression` is set, or `rv.valueFunc` is `"SUM"`/`"COUNT"`.
- New composed gate in `get_fetch_config_from_po.ts`, next to `getRollupAdminLevel`:
  `getEffectiveRollupLevel(resultsValue, config)` = `isRollupEligibleResultsValue(resultsValue) ? getRollupAdminLevel(config) : undefined`.
- `getRollupAdminLevel(config)` stays config-only (the display pipeline only has `ResultsValueForVisualization`, which has no `valueFunc` — display correctness is data-driven there, no sentinel rows arrive for ineligible metrics).
- Callers that must switch to `getEffectiveRollupLevel`: the fetch-config builder (1.4), the UI checkbox gate (3.3), the save-time strip (3.2), the AI tool validation (6.1).

### 1.3 Label context helper (`lib/get_fetch_config_from_po.ts`)

New single source of truth replacing BOTH `getRollupRowLabel`'s heuristic and `pinnedParentLevel` in `_3_disaggregation.tsx`:

```ts
type RollupLabelContext =
  | { kind: "subset" }
  | { kind: "pinned"; level: AdminLevel; value: string | undefined }
  | { kind: "national" };
getRollupLabelContext(config: PresentationObjectConfig): RollupLabelContext | undefined
// undefined when getRollupAdminLevel(config) is undefined
```

Rules, in precedence order (level = `getRollupAdminLevel(config)`):

1. **subset** — any `filterBy` entry on an admin level at or coarser than `level` (including `level` itself) with `values.length >= 2`.
2. **pinned** — otherwise, the FINEST admin level coarser than `level` that is pinned to one value: displayed as replicant (`value` = `config.d.selectedReplicantValue`, may be undefined) or single-value `filterBy`. This fixes the skip-level bug: for an AA4 rollup check AA3 then AA2, not just AA3.
3. **national** — otherwise.

Non-admin filters (facility_type etc.) deliberately do not affect the label ("national among the selected subset" reading).

### 1.4 Fetch config builder (`lib/get_fetch_config_from_po.ts`)

- `getFetchConfigFromPresentationObjectConfig`: use `getEffectiveRollupLevel(resultsValue, config)`; emit only `includeAdminAreaRollup` + `adminAreaRollupLevel`. **Delete `adminAreaRollupPosition` from the emitted object.**
- `GenericLongFormFetchConfig` (`lib/types/presentation_objects.ts`): remove `adminAreaRollupPosition`.
- `hashFetchConfig`: remove the position segment (line ~276). Keep `includeAdminAreaRollup` + `adminAreaRollupLevel ?? ""`.
- Grep for every other `adminAreaRollupPosition` reference on the fetch-config type: `validate_fetch_config.ts`, `query_helpers.ts`, `format_metric_data_for_ai.ts`, `server/routes/caches/visualizations.ts`, `client/src/state/project/t2_presentation_objects.ts` — remove/adjust each. (`d.adminAreaRollupPosition` on the PO config STAYS — it now drives only sort generation.)

### 1.5 Validator dedup (`lib/validate_fetch_config.ts`)

- Drop the `adminAreaRollupPosition` block (field gone).
- Replace the hardcoded `["admin_area_2", ...]` with `!isAdminLevel(...)` imported from lib.
- Replace the hardcoded valueFunc list with `valueFuncStrict.options`.

### 1.6 Off-state canonicalization (`lib/normalize_po_config.ts`)

- `normalizePOConfigForStorage(config, resultsValue)` — add the `resultsValue` param (only caller is `getConfigForSave` in `visualization_editor_inner.tsx`, which has `p.poDetail.resultsValue`).
- When `!config.d.includeAdminAreaRollup || getEffectiveRollupLevel(resultsValue, config) === undefined`: store with `includeAdminAreaRollup` and `adminAreaRollupPosition` both omitted (undefined).
- When kept: ensure `adminAreaRollupPosition` defaults to `"bottom"` if unset.
- `getStartingConfigForPresentationObject` (`lib/types/presentation_objects.ts:366-367`): omit both fields instead of `includeAdminAreaRollup: false` (canonical off = absent).

## Phase 2 — server query layer

### 2.1 Single sentinel (`server/server_only_funcs_presentation_objects/query_helpers.ts`)

- `buildAdminAreaRollupQuery`: always emit `ROLLUP_SENTINEL`; delete the position ternary.

### 2.2 Naming + v1/v2 cleanup (same dir)

- Rename: `buildSelectQueryV2` → `buildSelectQuery`, `buildCombinedQueryV2` → `buildCombinedQuery`, `applyPostAggregationExpressionV2` → `applyPostAggregationExpression`, `QueryConfigV2` → `QueryConfig`. Callers are all within `server/server_only_funcs_presentation_objects/` + `get_presentation_object_items.ts`.
- Delete every "v2 version" / "Same as v1" / "identical to v1" comment and the stale step numbering in `get_combined_query.ts`.
- `buildAggregateColumns(values, forNationalTotal)` → `buildAggregateColumns(values, mode: "main" | "rollup")` (makes the identity→SUM switch visible at call sites; with Phase 1.2 in place identity+rollup only co-occur with a PAE, where SUM of ingredients is correct).
- Fix the "Main and National Query Builders" header → rollup naming.

### 2.3 Comment dedupe (repo-wide)

The gate contract is restated in 8+ places, five of which say "finest admin level" (wrong — the rule is EXACTLY ONE effective level). Keep the one correct doc comment on `getRollupAdminLevel`; reduce all others to a one-line pointer ("see getRollupAdminLevel"): `lib/admin_area_rollup.ts` header, `get_fetch_config_from_po.ts:41-45`, `query_helpers.ts:57-60`, `_3_disaggregation.tsx:297-299`, `get_data_config_from_po.ts` (x4), `visualization_editor_inner.tsx:247-252`, AI tool schema description (see 6.1).

## Phase 3 — editor UI

### 3.1 Delete the eager clearing effect (`visualization_editor_inner.tsx:253-260`)

Root cause of the glitchy UI: filter chips toggle one value at a time, so building a multi-value filter passes through a single-value state → gate closes for one tick → flag permanently wiped + control unmounts/remounts unchecked. Delete the whole `createEffect`. Safe because the fetch builder re-derives `includeAdminAreaRollup` (1.4) and the checkbox is hidden when the gate is closed; persistence is handled at save time (1.6).

### 3.2 Save-time strip

`getConfigForSave` passes `p.poDetail.resultsValue` into the new `normalizePOConfigForStorage` signature (1.6). No other change.

### 3.3 Checkbox gate + radio fixes (`_3_disaggregation.tsx`)

- Gate the rollup section on `getEffectiveRollupLevel(p.poDetail.resultsValue, p.tempConfig) === p.disOpt.value` (poDetail is already a prop; thread it into `DisaggregationOptionSettings`).
- Checkbox onChange (enable): also set `adminAreaRollupPosition` to current `?? "bottom"`.
- RadioGroup: `value={p.tempConfig.d.adminAreaRollupPosition ?? "bottom"}` (legacy/preset configs arrive with it unset).
- Checkbox label from `getRollupLabelContext(p.tempConfig)`:
  - `national` → "Include National results" (existing strings)
  - `pinned` → "Include {LevelLabel} results" (existing strings)
  - `subset` → `t3({ en: "Include total of selected areas", fr: "Inclure le total des zones sélectionnées" })`
  - Delete `pinnedParentLevel()`/the local heuristic entirely.
- Replace `disOpt: any; keyedDis: any` (`:272-277`) with `DisaggregationSectionProps["allDisaggregationOptions"][number]` and `PresentationObjectConfig["d"]["disaggregateBy"][number]`.
- Alignment: replace the `text-right` wrapper with `flex justify-end` on the checkbox row (panther Checkbox is a block-level flex label; text-align does nothing).
- Delete the redundant explicit reads at `visualization_editor_inner.tsx:235-238` (the top-level `for (k in tempConfig.d)` loop already tracks both fields; manually verify checkbox + radio toggles still refetch/re-render the preview afterwards).

### 3.4 Replicant dead-click (`client/src/state/project/t2_presentation_objects.ts:335`)

`config.d.selectedReplicantValue = validValues[0].id` raw-mutates the unwrapped live store → no notification, and Solid's setter equality-guard then swallows the user's first click on that same value. Fix: never mutate the passed-in config — build a local copy for the fetch (`{ ...config, d: { ...config.d, selectedReplicantValue: chosen } }`) and surface the auto-chosen value to the caller so the editor applies it via `setTempConfig`. Investigate the generator's call sites first; keep the external contract (yielded items) unchanged.

## Phase 4 — display pipeline

### 4.1 Labels + position-aware sort (`client/src/generate_visualization/get_data_config_from_po.ts`)

- `getRollupRowLabel` rewritten on `getRollupLabelContext`:
  - `pinned` (value set) → `` `${resolveAdminAreaLabel(value)} — ${t3({ en: "Total", fr: "Total" })}` `` (fixes the Bauchi/Bauchi collision)
  - `pinned` (value undefined) / `national` → `t3(TC.national)`
  - `subset` → `t3({ en: "Total (selected areas)", fr: "Total (zones sélectionnées)" })`
- Replace the `rollupAwareSortByLabel` const with:
  `getRollupAwareSort(config): HeaderSortConfig` → when rollup active (`config.d.includeAdminAreaRollup && getRollupAdminLevel(config)`): position `"top"` → `{ base: "by-label", first: [ROLLUP_SENTINEL, LEGACY_ROLLUP_SENTINEL] }`, else `{ base: "by-label", last: [ROLLUP_SENTINEL, LEGACY_ROLLUP_SENTINEL] }`; when inactive → plain `"by-label"`. (Also resolves the split finding: no more sentinel pins/labels baked into every figure.)
- `buildLabelReplacements`: add the sentinel entries (both ids, same label) only when rollup is active.
- Chart indicator ("Bars") axis pin — VERIFIED SEMANTICS (2026-06-10, supersedes the review's interpretation): in panther, `sortIndicatorValues` = any string means the indicator axis keeps DATA order ("none" = no value sort, headers in first-appearance order; asc/desc = by-value reorder). This is deliberate, year-old behavior (pre-refactor code had the same `if (!sortIndicatorValues)` guard; `--v` axes rely on data order = module-defined valueProps order). `sort.indicator` has NEVER applied to this app's charts — the app passing `getChartIndicatorSort` is dead config, not intent. Do NOT map `"none"` → `undefined` globally (would alphabetize `--v` axes, breaking module-defined value ordering).
  Fix, surgical, zero behavior change except the pin:
  1. Panther (in the panther repo, then resync — never edit `panther/` here): make `base` optional in `sortByPinned`/`HeaderSortConfig` pinned variant — absent base compares equal within the non-pinned bucket; JS stable sort preserves data order. (~3 lines in `_001_render_system/header_types.ts`.)
  2. App: ONLY when rollup is active AND the rollup level's `disDisplayOpt === "indicator"` AND `s.sortIndicatorValues === "none"`: pass `sortIndicatorValues: undefined` and `sort.indicator = { first|last: [ROLLUP_SENTINEL, LEGACY_ROLLUP_SENTINEL] }` (pin-only, no base). All other charts keep passing `"none"` unchanged. With asc/desc the National bar participates in value order (accepted).
  Open product question, explicitly OUT of this plan: whether `indicator_common_id` on the Bars axis under "none" should get canonical id order (today: SQL-emission order, since forever). Decide separately; would have to exclude `--v` axes.

### 4.2 Maps (`lib/get_fetch_config_from_po.ts`)

Gate out maps in `getRollupAdminLevel`: return `undefined` when `config.d.type === "map"`. (Cheapest correct fix for raw-sentinel pane captions; checkbox disappears in map editors, fetch never includes rollup.)

### 4.3 Conditional formatting auto domain (`client/src/generate_visualization/conditional_formatting/compile.ts:18-26`)

When rollup is active and `cf.domain === "auto"`, the live min/max includes the National row, compressing all regional cells on SUM metrics. Compute the domain client-side from non-sentinel rows (jsonArray rows whose rollup-level column is not a sentinel) and pass it as a fixed domain; leave behavior unchanged when rollup is off. Read `compile.ts` + its panther call contract before implementing.

### 4.4 Series color stability (`client/src/generate_visualization/get_style_from_po/_0_common.ts:218-277`)

Cheap part only: in the series color/style resolution, detect the sentinel ids and return a fixed neutral emphasis color (pick one from the design system, e.g. the darkest neutral) instead of a palette slot. Residual index shift of the OTHER series when position is "top" is accepted (panther's index-keying; backlog).

## Phase 5 — migration sweep fix

`server/db/migrations/data_transforms/po_config.ts` (+ the sweeps sharing the gate: `dashboard_items.ts`, `reports.ts`, `metric.ts`, `slide_config.ts`):

- Bug: rows whose only drift is the legacy keys `includeNationalForAdminArea2`/`includeNationalPosition` PASS `safeParse` (zod strips unknown keys), so Block 24's rename never runs and runtime parsing silently drops the user's setting.
- Fix: export a `configDNeedsForcedTransform(d): boolean` from `po_config.ts` checking for the legacy keys; every sweep's skip gate becomes `parses && !configDNeedsForcedTransform(...)`. Transform stays idempotent. Follow PROTOCOL_APP_MIGRATIONS.md conventions; verify against `wb-fastr-modules/.validation` expectations if applicable.
- Note Block 24 maps `includeNationalPosition` → `adminAreaRollupPosition`; with 1.6's canonicalization the normalizer will tidy these on next save, but the migration must still preserve the user's intent now.

## Phase 6 — AI tools

### 6.1 `client/src/components/project_ai/ai_tools/tools/visualization_editor.tsx`

- When `input.includeAdminAreaRollup === true`: compute `getEffectiveRollupLevel` on the post-update config; throw a descriptive error if undefined (mirror the existing display-option validation pattern) instead of silently no-oping.
- When enabling and position unset: default `adminAreaRollupPosition` to `"bottom"`.
- Fix the input schema description: state the real gate (exactly one grouped admin level, not replicant/mapArea, not single-value-filtered, metric must be SUM/COUNT or have a post-aggregation expression) — the current "finest admin level" text misinforms the model.

### 6.2 Parity note (`_internal/format_metric_data_for_ai.ts` + `format_viz_editor_for_ai.ts`)

Lean fix: comment at the hardcoded `includeAdminAreaRollup: false` stating the exclusion is intentional, and when the viz config has the rollup enabled, append a line to the AI context: "The rendered figure also includes a total ('National') row, excluded from this data." `format_viz_editor_for_ai` additionally reports the position and, when the gate is closed, why the total row is unavailable.

## Phase 7 — wb-fastr-modules (separate repo)

- Remove `includeAdminAreaRollup: true` from `m006/_metrics/m6-02-01.ts` (~line 51) and `m6-03-01.ts` (~line 51).
- Rebuild `definition.json` via that repo's build process (verify entries at ~313 and ~545 are regenerated, not hand-edited).
- m007 needs no change — the Phase 1.2 gate makes its identity metrics ineligible.

## Phase 8 — verification

1. `deno task typecheck` (server + client) clean.
2. Manual (server restart required — no --watch):
   - Scorecard metric (identity, no PAE): rollup checkbox no longer offered.
   - PAE metric grouped by AA2: National row value = ratio of summed ingredients (compare against a hand SQL check).
   - Filter AA2 to one value, disaggregate AA4 only: row + checkbox say "{Region} — Total" family, not "National".
   - Filter AA2 to two values: "Total (selected areas)".
   - Click filter chips one at a time on the rollup level with the box checked: setting survives.
   - Legacy/preset config (position unset): radio shows Bottom selected; row at bottom.
   - Top/bottom toggle: row moves with NO network refetch (check devtools).
   - Bar chart with admin level on Bars axis: National bar pinned per position when sort = "none".
   - Map editor with second admin level: no rollup checkbox.
   - Existing dashboard/report figures (stored FigureInputs with `zzNATIONAL`): still render "National" pinned correctly.
   - DB row with legacy `includeNationalForAdminArea2`: migration renames it on startup sweep.
3. Re-run `/code-review` on the diff before deploy.
