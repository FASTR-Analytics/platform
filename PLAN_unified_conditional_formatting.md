# Unified Conditional Formatting

Plan for merging the table/chart stoplight CF system and the map color-scale system into one object model, one compile path, and one UI editor.

## 1. What's actually there

Panther already has the primitives. Two separable concerns, cleanly split:

1. **Per-value coloring** — `valuesColorFunc: (v, min, max) => color`, invoked whenever a content func returns the sentinel `777` (for `color` / `fillColor` / `backgroundColor`). The map path uses this today. Panther exposes helpers `valuesColorScale(ContinuousScaleConfig)` for gradients and `thresholdColorFunc(cutoffs, colors)` for stepped coloring — both return a `ValuesColorFunc`.
2. **Per-cell / per-bar custom callback** — `content.tableCells.func`, `content.bars.func`, etc. can each be an `(info) => styleOverride` function. Tables today use this to stamp `backgroundColor` per cell.

The table stoplight system ([conditional_formatting.ts:68-149](client/src/generate_visualization/conditional_formatting.ts#L68)) uses path 2 but could equally use path 1 — every existing preset is expressible as `thresholdColorFunc(...)`. The map system ([_0_common.ts:242-281](client/src/generate_visualization/get_style_from_po/_0_common.ts#L242)) already uses path 1.

**Unification target:** compile one `ConditionalFormatting` config into a `ValuesColorFunc`, wire it at the `valuesColorFunc` root, and make every renderer that cares use `777`.

## 2. The unified object model

Three-mode discriminated union stored at `s.conditionalFormatting`:

```ts
type ConditionalFormatting =
  | { type: "none" }
  | ConditionalFormattingScale       // gradient, continuous or stepped
  | ConditionalFormattingThresholds; // step function at explicit cutoffs

type ConditionalFormattingScale = {
  type: "scale";
  palette:
    | { preset: "red-green" | "red" | "blue" | "green" | "diverging-rg" | ... }
    | { from: ColorKeyOrString; to: ColorKeyOrString; via?: ColorKeyOrString };
  reverse?: boolean;
  steps?: number;                    // undefined/0 = continuous; >= 2 = N discrete bands
  domain:
    | { kind: "auto" }
    | { kind: "fixed"; min: number; max: number; mid?: number };
  noDataColor?: ColorKeyOrString;
};

type ConditionalFormattingThresholds = {
  type: "thresholds";
  // N cutoffs -> N+1 buckets. bucketColors.length must equal cutoffs.length + 1.
  cutoffs: number[];                 // ascending
  bucketColors: ColorKeyOrString[];
  bucketLabels?: TranslatableString[]; // optional legend text per bucket
  comparison?: "lt" | "lte";         // tie-breaker at a cutoff, default "lt"
  noDataColor?: ColorKeyOrString;
};
```

Every current preset compiles in:

- `fmt-90-80` → `{ type:"thresholds", cutoffs:[0.8, 0.9], bucketColors:[red, yellow, green] }`
- `fmt-thresholds-2-5-10` → thresholds with 6 cutoffs + 7 bucketColors + `base200` in the middle bucket
- map red-green continuous → `{ type:"scale", palette:{ preset:"red-green" }, domain:{ kind:"auto" } }`
- map 5-step discrete → same + `steps: 5`
- map fixed range → `domain:{ kind:"fixed", min, max }`

## 3. Layering — panther vs. wb-fastr

Pragmatic split, done in two phases:

**Phase 1 — ship in wb-fastr.** Type + compile + editor all live app-side. Panther untouched except possibly exposing one or two missing helpers.

**Phase 2 — extract into panther** (optional; do only if a second app materialises, or if the editor's complexity justifies it).

- `modules/_003_figure_style/conditional_formatting.ts` (or new `_004_`): the `ConditionalFormatting` type + `compileToValuesColorFunc(cf)` + `compileToLegendItems(cf, formatter)`.
- `modules/_30X_conditional_formatting_editor/`: the Solid UI component, parameterised by an app-supplied preset registry + color themes.

Phase 1 alone is a complete win; Phase 2 is only worth it if the abstraction proves itself.

## 4. Wiring changes in wb-fastr

**Compile step** — new `client/src/generate_visualization/conditional_formatting/compile.ts`:

- `compileCfToValuesColorFunc(cf: ConditionalFormatting): ValuesColorFunc | undefined`
- `compileCfToLegendItems(cf, formatter): LegendItem[] | undefined`

**[_0_common.ts](client/src/generate_visualization/get_style_from_po/_0_common.ts) changes:**

- Delete `getCutoffColorFunc*`, `getCutoffColorFuncDynamic`, `getMapValuesColorFunc`, `MAP_COLOR_PRESETS` — all superseded.
- `getTableCellsContent` returns `{ func: { backgroundColor: 777 }, textFormatter: ... }` (unconditional — when CF is `"none"`, `valuesColorFunc` is undefined and 777 falls through harmlessly; or use `{ backgroundColor: undefined }` when none).
- Drop the `content.bars.func` CF branch; bars become `{ color: 777, ... }` (or `{ show: true }` when no CF).
- `valuesColorFunc` at the root is always `compileCfToValuesColorFunc(cf)`.
- `getMapRegionsContent` stays unchanged (already uses `fillColor: 777`).

**[conditional_formatting.ts](client/src/generate_visualization/conditional_formatting.ts) shrinks dramatically.** `getColorFuncGivenConditionalFormatting` disappears. `getLegendItemsFromConfig` keeps only its special-chart branches (coverage / barChart / disruptions) and delegates the rest to `compileCfToLegendItems`.

**Specials unchanged** — `specialCoverageChart`, `specialBarChart`, `specialDisruptionsChart`, `specialScorecardTable` keep their short-circuit in [get_style_from_po.ts:9-29](client/src/generate_visualization/get_style_from_po.ts#L9). CF editor stays hidden for those.

## 5. Unified UI editor

One component: `<ConditionalFormattingEditor value={cf} onChange={onCf} formatAs="percent|number" />`.

Top-level radio: **Off / Color scale / Thresholds**.

**Color scale panel** (swallows today's map UI):

- Palette: preset dropdown, "Custom" opens 2 or 3 `<ColorPicker>`s (from / via? / to)
- Reverse checkbox
- Steps: radio Continuous / Discrete, + slider 3–10 when Discrete
- Domain: checkbox "Fix range", + min/max(/mid) number inputs when fixed

**Thresholds panel** (swallows today's table stoplight UI):

- Presets dropdown — click-to-fill for the 9 current presets (90/80, 80/70, 10/20, 05/10, 01/03, ±10, ±1/2/5, ±2/5/10, ±5/10/20). Keeps the one-click UX.
- Editable row list `[cutoff] [color] [label?]` with add/remove
- `[aboveColor]` terminal bucket
- Reverse (swaps bucket colors)

Places the editor lives: replace the `RadioGroup` in [_table.tsx:35-56](client/src/components/visualization/presentation_object_editor_panel_style/_table.tsx#L35) and [_chart_like_controls.tsx:154-175](client/src/components/visualization/presentation_object_editor_panel_style/_chart_like_controls.tsx#L154), and replace the CF-relevant part of [_map.tsx:39-167](client/src/components/visualization/presentation_object_editor_panel_style/_map.tsx#L39). `mapProjection` and `mapShowRegionLabels` stay in `_map.tsx` — they're not CF.

## 6. Backwards compatibility

This is a **Pattern 1** job per [DOC_legacy_handling.md](DOC_legacy_handling.md) — the existing `adaptLegacyPresentationObjectConfig` in [server/legacy_adapters/po_config.ts](server/legacy_adapters/po_config.ts) already normalises PO configs on read, so extend it with two transforms:

**Transform A — the 9 string presets → object.** When `s.conditionalFormatting` is a string (or missing), rewrite to the corresponding `ConditionalFormatting` object using a hardcoded `LEGACY_CF_PRESETS` map. `"none"` / missing → `{ type:"none" }`.

**Transform B — map color fields → object.** Only if the PO is a map (`d.type === "map"`) AND `s.conditionalFormatting` is `"none"` after Transform A. Build a `ConditionalFormattingScale` from `mapColorPreset`, `mapColorFrom/To`, `mapColorReverse`, `mapScaleType`, `mapDiscreteSteps`, `mapDomainType/Min/Max`. Then delete the old map color fields from the object (self-heal on re-save).

TS types for new shape drop `s.mapColorPreset` / `From` / `To` / `Reverse`, `s.mapScaleType`, `s.mapDiscreteSteps`, `s.mapDomainType` / `Min` / `Max` from `PresentationObjectConfig` — writes can't produce them. Old rows self-heal on next save.

**No Pattern 4 needed** — the read-time adapter + self-heal is sufficient. The Zod schema (if present) describes the new shape only; the adapter runs before Zod.

**Cache adapter wiring** already exists via `adaptLegacyPODetailResponse` (Pattern 1 doc, line 52-56). Double-adapting is a no-op, so we're fine.

**Cleanup audit row** to add to [DOC_legacy_handling.md](DOC_legacy_handling.md#L213):

| Site | Trigger for removal |
| --- | --- |
| Legacy CF string-preset + map-color-field adapter transforms in `po_config.ts` | Once every deployed project has re-saved affected configs (or a Pattern 4 forces it) |

## 7. Rollout order

1. Define `ConditionalFormatting` type in `lib/` (shared client+server); export.
2. Write `compileCfToValuesColorFunc` + `compileCfToLegendItems` + tests (unit-testable pure functions — cover all 9 legacy presets and all map combos here).
3. Write `LEGACY_CF_PRESETS` table mapping the 9 strings → objects. Use in both the adapter and the editor preset dropdown — single source of truth.
4. Extend `po_config.ts` adapter with Transforms A + B.
5. Build `<ConditionalFormattingEditor />`; replace UI in `_table.tsx`, `_chart_like_controls.tsx`, and the color portion of `_map.tsx`.
6. Rewire `_0_common.ts` and `conditional_formatting.ts` (delete superseded code).
7. Update `PresentationObjectConfig` TS type to new shape; confirm every read path goes through the adapter (type drift will flag missed sites).
8. Manual smoke: existing PO with stoplight table, existing PO with custom-color map, new PO with new editor.

## 8. Decisions worth pushing on

- **Thresholds editor ergonomics.** Excel-style CF is notoriously fiddly. Keep the "click a preset" path as the 80% case; the row editor is for power users. Don't over-engineer field-by-field validation.
- **Should line/area charts get CF?** Probably not — point-by-point coloring on a line reads as noise. Keep CF scoped to bars / points / tableCells / mapRegions.
- **`allowIndividualRowLimits`** (per-row auto domain) is orthogonal to CF. Leave it alone; it governs y-axis, not cell color.
- **Phase-2 extraction to panther** — don't do it preemptively. Ship phase 1; revisit only if a second consumer appears.

Main tradeoff: this is a meaningful refactor of a working system, and the adapter path is non-trivial. Net value is high because the hardcoded preset list caps user flexibility today and maps already have the richer model — users will inevitably ask for map-style coloring on tables. Doing it once, unified, is cheaper than adding a second hardcoded preset every quarter.
