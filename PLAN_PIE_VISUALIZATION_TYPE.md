# PLAN — Add a "pie" presentation type

> **Status (2026-08-04):** Planned — not started. Pre-flighted against the code
> (all file/line/symbol references verified; corrections folded in).
> Prerequisite panther sync is done (manifest `eee2758`; vendored copy carries
> the current pie contract: `pie.sweepAngle`, `pie.sliceGap`, `zPieInputs`; zero
> content drift vs source).

Panther already ships the pie figure end-to-end (`panther/_010_pie/`,
`zPieInputs` in the `zFigureInputs` union, `PieRenderer` in the figure-renderer
switches, the `pie` style block + `content.slices`). This plan adds only the
wb-fastr side: a `d.type: "pie"` presentation option, the config → `PieInputs`
mapping, and the editor surfaces.

## Design decisions (recorded — do not relitigate during implementation)

1. **Own `type: "pie"`, not a chart style variant.** Chart-ov/oh share one data
   shape and differ only in orientation (`s.horizontal`); pie has no indicator
   axis and a different slot set. Same argument that made map its own type.
2. **No new `DisaggregationDisplayOption`.** Map needed `mapArea` because its
   geo column is matched against GeoJSON feature ids, not laid out. Pie's slice
   axis is panther's `seriesProp` (a pie is one stacked bar in polar
   coordinates; `PieSliceInfo extends ChartSeriesInfo`), so pie reuses the
   existing slots:

   | Slot          | Panther prop             | Editor label                    |
   | ------------- | ------------------------ | ------------------------------- |
   | `series`      | `seriesProp` (slices)    | "Slices"                        |
   | `cell`        | `paneProp`               | "Grid"                          |
   | `row` / `col` | `tierProp` / `laneProp`  | "Rows" / "Columns"              |
   | `replicant`   | query pin, as everywhere | "Different charts (replicants)" |

   `valuesDisDisplayOpt` works unchanged: `"--v"` on `series` = each value prop
   a slice; on `cell` = one pie per value prop (panther allows `"--v"` on pie's
   pane/tier/lane, unlike map). The default values slot is `cell`, NOT `series`:
   `convertVisualizationType` seeds `usedOpts` with the destination's
   `defaultValuesDisDisplayOpt` before remapping dimensions
   (`lib/convert_visualization_type.ts:30-45`), so a `series` default would
   collide with the `indicator`/`mapArea` → `series` fallbacks — the collision
   escape would shunt the user's category dimension to `cell`, giving a grid of
   one-slice pies on every chart→pie / map→pie switch. With `cell` as the values
   home, those conversions land the dimension on Slices; users move values to
   Slices manually for the components-of-a-total case.
3. **Denominator: always `total: "sum"` (omit the field).** Panther normalizes
   by cell sum, so raw counts and percentages both render correctly with no user
   knob. Explicit totals / partial pies / gauges (`sweepAngle < 360`) are
   panther-ready; out of scope here.
4. **Reuse `s.sortIndicatorValues` as pie's `sortSeriesValues`.** Identical enum
   (`ascending | descending | none`), identical concept (value-driven axis
   ordering). Pie panel labels it "Sort slices by value". No new field. Because
   pie USES the field, pie's `styleResets` must NOT reset it — `styleResets`
   apply on switching TO a type (`convert_visualization_type.ts:86-90`, and
   again in `_1_summary.tsx:105`), so a reset would wipe the slice sort on every
   entry into pie while the per-type cache restores it on revisit. Map resets it
   only because map ignores it (dead-field cleanup); with `indicator` → `series`
   carrying the dimension across, carrying the value sort across is semantically
   continuous.
5. **Two new `s` fields, both `.optional()`** — optionality is load-bearing:
   `presentationObjectConfigSStrict` is all-required, stored slide/dashboard/
   report bundles embed config copies that are never backfilled, and a required
   field would fail the boot sweep (see the `showNValues` comment in
   `_presentation_object_config.ts`).
   - `pieInnerRadiusRatio?: number` — 0/absent = pie; UI is a Pie/Doughnut radio
     writing `0` / `0.55`. Read as `?? 0`.
   - `pieGroupSmallSlices?: number` — global-share threshold as a fraction
     (0–1); 0/absent = off. Maps to panther `groupSmallSlices` with a localized
     "Other" label. UI shows percent, stores fraction.
6. **No time dimensions on pie.** A pie pooling months as parts-of-a-whole is
   wrong. `TIME_BASED` in `lib/disaggregation_labels.ts` stays
   `["table", "chart"]` — no change needed; time dims are simply never offered
   for pie (same as map).
7. **No roll-up on pie.** A "National" total slice inside its own parts doubles
   the whole. Exclude via `isRollupCandidateDimension`. Consequence: the pie
   data-config builder uses plain sorts (no `getRollupAwareSort`), but DOES use
   `buildLabelReplacements` — slices/legend show category labels, unlike map.
8. **No conditional formatting on pie.** Slices resolve through the series-color
   sentinel (666), not the values-color sentinel (777); CF would need deliberate
   wiring and slice-by-value coloring has no use case. Pie panel carries no CF
   section.
9. **Style pipeline: extend `_1_standard.ts`, not a new builder.** Map is
   already handled there via narrow type-gated blocks (`map: {...}`,
   `getMapRegionsContent`); pie follows the same pattern. A parallel `_6_pie.ts`
   builder would duplicate the text/legend/color scaffolding the standard
   builder owns. Note: `grid.showGrid` needs NO pie exclusion — zero-way figures
   feed `{type: "none"}` axes into panther, which generates no grid primitives
   (map is proof by example).
10. **Availability: always offered** (like chart/table, unlike timeseries/map).
    A metric with nothing to slice renders one full circle — useless but not
    broken; gating adds complexity for no protection.
11. **Zero server/SQL work.** The server is presentation-type-blind:
    `GenericLongFormFetchConfig` carries no `d.type`, and every `disaggregateBy`
    entry becomes a `groupBy` regardless of slot
    (`lib/get_fetch_config_from_po.ts:38-49`). The only type-driven query
    behavior is the timeseries period push; pie adds nothing.

## Implementation steps (ordered)

### 1. Enums + schemas (lib/types)

- `_metric_installed.ts:39` — add `"pie"` to `presentationOptionSchema`.
  Forward-only; no migration (old rows never carry `"pie"`, so the boot
  transform's `isMap` branch in
  `server/db/migrations/data_transforms/po_config.ts` needs no pie arm).
- `_metric_installed.ts` `configSStrict` (already `.partial()`) — add
  `pieInnerRadiusRatio: z.number()` and `pieGroupSmallSlices: z.number()`.
- `_presentation_object_config.ts` `presentationObjectConfigSStrict` — add the
  same two fields with `.optional()` (see decision 5).
- `_module_definition_github.ts` — mirror all of the above:
  `presentationOptionGithub` (`:102`) gets `"pie"`; `configSGithubStrict`
  (`:189`) gets the two fields. Must stay in lockstep or module repos cannot
  author pie presets.
- `presentation_object_defaults.ts` `DEFAULT_S_CONFIG` — add
  `pieInnerRadiusRatio: 0`. Do not add `pieGroupSmallSlices` (absent = off).

### 2. The per-type table (lib/types/presentation_objects.ts)

- `VIZ_TYPE_CONFIG` — add:

  ```ts
  pie: {
    defaultValuesDisDisplayOpt: "cell", // NOT "series" — decision 2 (collision)
    defaultContent: "bars",
    disaggregationDisplayOptions: ["series", "cell", "row", "col", "replicant"],
    disDisplayOptFallbacks: {
      indicator: "series",
      mapArea: "series",
      rowGroup: "row",
      colGroup: "col",
    },
    styleResets: {
      // No sortIndicatorValues reset — decision 4 (pie uses the field)
      specialBarChart: false,
      specialCoverageChart: false,
      specialDisruptionsChart: false,
      specialBarChartInverted: false,
      barsStacked: false,
      verticalTickLabels: false,
    },
  },
  ```

- `get_DISAGGREGATION_DISPLAY_OPTIONS` — add the pie row to `labelMap` (`series`
  = Slices/Tranches/Fatias; `cell`/`row`/`col`/`replicant` same labels as map's
  row; unused slots `""`), **and fix the hardcoded loop at `:310`** to iterate
  `Object.keys(VIZ_TYPE_CONFIG) as PresentationOption[]` instead of the literal
  array — the current form silently skips a new type, which then throws in
  `getNextAvailableDisaggregationDisplayOption`.
- `get_PRESENTATION_SELECT_OPTIONS` — add
  `{ value: "pie", label: t3({ en: "Pie chart", fr: "Graphique circulaire", pt: "Gráfico circular" }) }`
  after the chart entry. No availability gate (decision 10).
- `get_PRESENTATION_OPTIONS_MAP` — add the pie entry (the `Record` return type
  makes omission a compile error). Zero callers in this repo, but lib is shared
  with the module-authoring repo — keep it.

### 3. Data config + figure inputs (client/src/generate_visualization)

- `get_data_config_from_po.ts` — add
  `getPieJsonDataConfigFromPresentationObjectConfig(...)` (in this file, not a
  new one: it needs the private helpers `buildLabelReplacements`,
  `includesIndicatorDisaggregation`; map's builder is separate only because it
  needs neither). Shape:

  ```ts
  export function getPieJsonDataConfigFromPresentationObjectConfig(
    resultsValue,
    config,
    effectiveValueProps,
    indicatorLabelReplacements,
    localization,
    jsonArray?,
  ): PieJsonDataConfig {
    if (config.d.type !== "pie") throw new Error("Bad config type");
    const seriesSort = includesIndicatorDisaggregation(config)
      ? { byIdOrder: get_INDICATOR_COMMON_IDS_IN_SORT_ORDER() }
      : "by-label";
    return {
      valueProps: effectiveValueProps,
      seriesProp: getDisaggregatorDisplayProp(
        resultsValue,
        config,
        ["series"],
        effectiveValueProps,
      ),
      paneProp: getDisaggregatorDisplayProp(
        resultsValue,
        config,
        ["cell"],
        effectiveValueProps,
      ),
      laneProp: getDisaggregatorDisplayProp(
        resultsValue,
        config,
        ["col"],
        effectiveValueProps,
      ),
      tierProp: getDisaggregatorDisplayProp(
        resultsValue,
        config,
        ["row"],
        effectiveValueProps,
      ),
      sort: {
        series: seriesSort,
        pane: "by-label",
        tier: "by-label",
        lane: "by-label",
      },
      sortSeriesValues: config.s.sortIndicatorValues,
      groupSmallSlices: config.s.pieGroupSmallSlices
        ? {
          threshold: config.s.pieGroupSmallSlices,
          label: pickLang(localization.language, {
            en: "Other",
            fr: "Autre",
            pt: "Outro",
          }),
        }
        : undefined,
      labelReplacements: buildLabelReplacements(
        resultsValue,
        config,
        indicatorLabelReplacements,
        {},
        localization,
        jsonArray,
      ),
    };
  }
  ```

  No `total` (decision 3). No rollup-aware sorts (decision 7). No date label
  replacements (time dims are never on pie, decision 6). Slot lookups are
  deliberately map-style single-slot (`["row"]`/`["col"]`, not chart's
  `["row", "rowGroup"]`) — pie's slot set has no group slots and conversion
  remaps them (step 2). Do NOT give `seriesProp` a `?? "--v"` fallback (chart's
  indicator axis has one): with values defaulting to `cell`, that would put
  `"--v"` on two axes; an empty Slices slot rendering one full circle is
  decision 10's accepted outcome.
- `build_figure_inputs.ts` — add the `effectiveConfig.d.type === "pie"` branch
  before the final throw: `figureType: "pie"`,
  `data: getPieDataTransformed({ jsonArray: items, jsonDataConfig })` (eager —
  see below; the function takes one `PieData` arg and passes transformed data
  through unchanged), the standard `withDateRange(withReplicant(...))`
  surrounds, `getStyleFromPresentationObject` style, and
  `legend: getLegendFromConfig(config, effectiveFormatAs, localization)`
  (returns `undefined` when CF is off → panther auto-derives the categorical
  legend from series headers with swatches from the same `seriesColorFunc` the
  slices use; do NOT use `buildMapAutoLegend` — that is the map scale legend).
  No numeric parse: panther coerces (`getValidNumberOrUndefined` does
  `Number(val)`; non-numeric → `undefined` → omitted slice) — and the map
  branch's parse covers a single `valueProp` anyway, so there was nothing to
  mirror. Transform eagerly: pass `getPieDataTransformed(...)` output as `data`
  (timeseries precedent, `build_figure_inputs.ts:88`; `zPieDataTransformed` is
  in the bundle schema union). This makes transform-time throws (negative
  values, "Missing --v assignment") land in `buildFigureInputs`, where the
  existing caller catch → error display handles them; passed untransformed, they
  would fire at measure/render inside panther, past that catch. Confirm the
  negative-value message reads acceptably in the editor preview (it reports the
  raw series id, not the display label).

### 4. Style (client/src/generate_visualization/get_style_from_po)

- `_1_standard.ts` — alongside the `map:` block, add (gated
  `config.d.type === "pie"`):
  - `pie: { innerRadiusRatio: config.s.pieInnerRadiusRatio ?? 0 }` — all other
    pie style keys keep panther defaults (`labelMode: "auto"`, etc.).
  - `content.slices` via a new `getPieSlicesContent(config, formatAs)` in
    `_0_common.ts`, mirroring `getMapRegionsContent` (returns `undefined` unless
    pie): `func` returns `{ dataLabel: { show: config.s.showDataLabels } }`;
    when `showDataLabels`, set `textFormatter` to
    `` (info) => `${info.seriesHeader.label} ${getFormatterFunc("percent", config.s.decimalPlaces ?? 0)(info.share)}` ``
    so `decimalPlaces` is honored (panther's built-in formatter auto-picks
    decimals otherwise). `getFormatterFunc` is the existing panther helper —
    same pattern as `_0_common.ts:298`; its `toPct*` variants multiply by 100,
    so the 0–1 `share` is passed directly. There is no `formatShareAsPercent`
    anywhere — do not invent one. Functions in style are fine — style is built
    at render, never persisted.
- No `showGrid` change (decision 9). Axis blocks / `forceYMax1` etc. are inert
  for pie — leave them.
- `client/src/components/_shared/dark_mode_figures.ts` — check whether pie slice
  labels need the map-style `text.dataLabels` recolor (`:99` branches on
  `figureType === "map"`); add pie to that branch only if dark-mode rendering
  shows a problem.

### 5. Editor UI (client/src/components)

- `visualization/presentation_object_editor_panel_style.tsx` — add
  `<Match when={p.tempConfig.d.type === "pie"}>` → new
  `presentation_object_editor_panel_style/_pie.tsx`. (The `<Switch>` has no
  fallback — a missing arm renders an empty style panel silently.)
- New `_pie.tsx` (model: `_map.tsx`), controls:
  - Pie / Doughnut radio → `s.pieInnerRadiusRatio` (`0` / `0.55`)
  - "Sort slices by value" (none / descending / ascending) →
    `s.sortIndicatorValues`
  - "Group small slices" checkbox + percent input → `s.pieGroupSmallSlices`
    (store fraction; suggest 0.03 when enabling)
  - "Show data labels" → `s.showDataLabels`; decimal places → `s.decimalPlaces`
    (shown when labels on)
  - "Hide legend" → `s.hideLegend`
  - Color scale + custom series styles: a small local block modeled on
    `_chart_like_controls.tsx:25-175` (colorScale `Select` +
    `editCustomSeriesStyles` button), minus its CF editor. Do NOT import
    `ChartLikeControls`: it is entangled with the CF editor, an axis section
    (`:253-291`), and a binary `type === "timeseries" ? … : …` slot-label select
    (`:95`) that would mislabel pie. `_map.tsx` has no color block to copy (map
    colors via CF only). No CF section, no axis limits (decision 8).
  - Grid columns control comes free from `SharedControlsTop` (gated on `cell`
    slot usage).
  - Reactivity: nothing to wire — the figureInputs memo deep-tracks all of
    `tempConfig.s`/`t` (`visualization_editor_inner.tsx:1403-1431`), and the
    refetch effect deep-tracks `d` via `trackStore(tempConfig.d)` (`:654-672`;
    the hand-enumerated dependency list it replaced is gone — do not add one
    back).
- Wizard: `project/add_visualization/step_3_configure.tsx` — add `"pie"` to
  `allTypes` (after `"chart"`), bump `grid-cols-4` → `grid-cols-5`. Pie is never
  disabled because the step-2 `get_PRESENTATION_SELECT_OPTIONS` entry is
  ungated, which makes `getDisabledReason`'s early
  `if (option) return undefined` fire — the `default:` arm is the DISABLED path,
  so the select-options entry is what keeps the card enabled; without it the
  card renders permanently disabled with no compile error. `type_card.tsx` — add
  the `TYPE_LABELS` entry (compile error until done). No art assets: type cards
  are label-only buttons.

### 6. Roll-up exclusion

- `lib/get_fetch_config_from_po.ts` `isRollupCandidateDimension` (~`:326`) — add
  `config.d.type !== "pie"` alongside the existing `!== "map"`. This gates both
  the editor checkbox and the query rollup dim. No migration-side change
  (historical data has no pie configs). A chart→pie conversion can carry
  `rollup: true` entries (`convert_visualization_type.ts:54-56` preserves them);
  with this gate no rollup rows are fetched for pie, so the carried flag is
  inert — only an unused "National" label replacement remains (verified in step
  8).

### 7. Follows automatically — verify, don't write

- AI tools: `AiVizConfigUpdateSchema.type` derives from `configDStrict` (picks
  up `"pie"`); slot validation in `validate_figure_config_edit.ts` and the AI
  formatters read `VIZ_TYPE_CONFIG` / `getValidValuesDisplayOptions`;
  `apply_figure_config_patch.ts` routes type changes through
  `convertVisualizationType`. Grep AI prompt/tool text for hardcoded
  "timeseries, table, chart, map" enumerations and add pie where found (check
  `format_viz_editor_for_ai.ts`, `format_figure_config_for_ai.ts`,
  `PROTOCOL_APP_AI_TOOLS.md`). Pre-flight found zero hits — both formatters
  interpolate from `VIZ_TYPE_CONFIG` — but re-grep at implementation time.
- `convertVisualizationType` — table-driven; verify pie ⇄ each type round-trips
  sensibly (slices → chart series, chart indicator → slices, map area → slices).
- Replicant machinery, `getEffectivePOConfig`, `getReplicateByProp` — fully
  type-agnostic.
- Table-only export gates (`export_dashboard_as_xlsx.ts:48`,
  `visualization_editor_inner.tsx:955`, `PresentationObjectMiniDisplay.tsx:135`)
  — pie correctly falls to the non-table branch.
- SYSTEM manifests: all touched/new files fall under existing globs
  (`client/src/components/visualization/**`,
  `client/src/generate_visualization/**`, lib type files already listed) — no
  `globs:` edits; run `deno run -A lint_systems.ts` to confirm.

### 8. Verification

- Typecheck + `lint_systems.ts` + repo fmt.
- Editor: create a pie from the wizard (e.g. metric disaggregated by
  admin_area_2 as Slices — and confirm the wizard's slot assignment
  (`getNextAvailableDisaggregationDisplayOption`) puts the chosen dimension on
  `series`, the first free slot with values on `cell`); exercise:
  multi-value-prop metric with `--v` on Slices and on Grid; grid of pies
  (`cell` + `row`/`col`); replicant slot; doughnut toggle; sort by value (and
  that switching into pie does NOT reset it — decision 4); group small slices
  ("Other" lands last, one legend); data labels + decimals; hide legend (works
  via `_1_standard.ts:59` `legendPosition: "none"` — no map-style
  `legend: undefined` handling needed); custom colors; type-switch chart → pie →
  chart (per-type cache + fallback remap: the chart's category dimension must
  land on Slices, not Grid — decision 2); a rolled-up chart converted to pie
  shows no phantom "National" slice (step 6).
- Capture surfaces: add a pie to a slide, dashboard, report; confirm the
  FigureBundle round-trip (`zPieInputs` validates `data` deeply, unlike map) and
  the public viewer render. Deck style: fonts apply via `getTextStyle`; no
  structural-color work expected.
- Dark mode: check slice label legibility (step 4 note).
- AI: `update_viz_config` switching a viz to pie; confirm slot validation
  messages read sensibly.

## Out of scope (parked, panther-ready)

- Gauges / partial pies (`sweepAngle`, explicit `total`, remainder styling) — a
  natural later fit for single-value percent metrics.
- CF-driven slice coloring (needs the 777 sentinel wired to `content.slices`).
- SYSTEM_10/SYSTEM_11 doc prose updates — batch into one pass at the end of
  implementation.
