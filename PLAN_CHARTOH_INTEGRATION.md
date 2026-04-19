# PLAN_CHARTOH_INTEGRATION — expose ChartOH in wb-fastr

## Prerequisite

ChartOH (horizontal-category bar/line/point chart) exists in panther:
`ChartOHRenderer`, `ChartOHInputs`, `getChartOHDataTransformed`,
`ChartOHJsonDataConfig`, `MergedChartOHStyle`. Before starting this plan, sync
panther into wb‑fastr's vendored `panther/` directory so these symbols are
available.

## 0. Design choice (settled)

Expose ChartOH as an **orientation toggle on the existing chart type**, not a
new `d.type`. Same data (`d.type === "chart"`), different visual presentation.
Users pick vertical/horizontal via a style-layer checkbox; wb‑fastr routes to
the right panther renderer internally.

Concretely: one new style flag `s.horizontal?: boolean` on
`PresentationObjectConfig.s`. When `true`, the chart flow emits ChartOH
inputs; when `false`/absent, it emits ChartOV inputs (current behaviour,
preserved for all existing saved slides).

Why not a separate `d.type === "chart_horizontal"`?

- Same source data; no reason to make users pick a different chart type at
  the data layer just to change orientation.
- Makes "toggle horizontal" a one-click style operation, not a data-model
  switch.
- `_chart.tsx` already owns visual-presentation flags (`barsStacked`,
  `verticalTickLabels`, `sortIndicatorValues`). Horizontal fits that slot.

## 1. Touch points overview

**[M]** modify, **[N]** new.

| # | File | Change |
|---|---|---|
| 1.1 | `lib/...` (wherever `PresentationObjectConfig.s` lives) | **[M]** Add `horizontal?: boolean` |
| 1.2 | `client/src/components/visualization/presentation_object_editor_panel_style/_chart.tsx` | **[M]** Add checkbox; gate `verticalTickLabels` on `!s.horizontal` |
| 1.3 | `client/src/generate_visualization/get_data_config_from_po.ts` | **[N]** Add `getChartOHJsonDataConfigFromPresentationObjectConfig` |
| 1.4 | `client/src/generate_visualization/get_figure_inputs_from_po.ts` | **[M]** Branch the `d.type === "chart"` handler on `s.horizontal` |
| 1.5 | `client/src/generate_visualization/get_style_from_po/_1_standard.ts` | **[M]** Route value-axis flags (max/min/allowIndividualLimits) to `xScaleAxis` when `s.horizontal` |
| 1.6 | `client/src/components/slide_deck/slide_rendering/convert_slide_to_page_inputs.ts` | **[M]** Extend the `in fi` guard to include `"chartOHData"` |

No change needed to: `_timeseries.tsx` (orthogonal), `_map.tsx`,
`_table.tsx`, `_chart_like_controls.tsx`, any `_3XX_*` components, legacy
migration block (see §8).

## 2. Schema (step 1.1)

In the shared `lib/` package, find the `PresentationObjectConfig.s` type
(the style-layer shape). Add one field:

```typescript
type PresentationObjectConfigStyle = {
  // …existing fields
  /**
   * When true, chart (d.type === "chart") renders as a horizontal-category
   * chart (ChartOH) — categories on Y, values on X. Default / undefined =
   * vertical (ChartOV). No effect for d.type !== "chart".
   */
  horizontal?: boolean;
};
```

Zod schema (if present): `horizontal: z.boolean().optional()`.

No migration needed: existing saved slides have `horizontal === undefined`,
which falls through to the existing vertical path.

## 3. UI (step 1.2)

File: [client/src/components/visualization/presentation_object_editor_panel_style/_chart.tsx](client/src/components/visualization/presentation_object_editor_panel_style/_chart.tsx).

Add the checkbox near the existing chart-level toggles. Gate
`verticalTickLabels` so it only appears when the chart is **not** horizontal
(the setting applies only to the X-text axis, which ChartOH doesn't have):

```tsx
<Checkbox
  label={t3({ en: "Horizontal", fr: "Horizontal" })}
  checked={p.tempConfig.s.horizontal ?? false}
  onChange={(v) => p.setTempConfig("s", "horizontal", v)}
/>
<Show when={!p.tempConfig.s.horizontal}>
  <Checkbox
    label={t3({
      en: "Vertical tick labels",
      fr: "Étiquettes de graduation verticales",
    })}
    checked={p.tempConfig.s.verticalTickLabels}
    onChange={(v) => p.setTempConfig("s", "verticalTickLabels", v)}
  />
</Show>
```

`sortIndicatorValues`, `barsStacked`, and every `ChartLikeControls` field
work identically in both orientations — no gating.

**Content-type × horizontal policy:** leave the checkbox available for all
content types (bars, points, lines). Horizontal bars is the common case, but
ChartOH supports horizontal lines/points and users may legitimately want
them (e.g. cumulative progression with long category labels).

## 4. Data config builder (step 1.3)

File: [client/src/generate_visualization/get_data_config_from_po.ts](client/src/generate_visualization/get_data_config_from_po.ts).

Add a new exported function alongside
`getChartOVJsonDataConfigFromPresentationObjectConfig` at line 135. The
function is **line-for-line identical** except:

- Return type: `ChartOHJsonDataConfig` (imported from panther, same shape as
  `ChartOVJsonDataConfig` minus the unused `yScaleAxisLabel`/`xScaleAxisLabel`
  field, neither of which wb‑fastr populates).
- Name: `getChartOHJsonDataConfigFromPresentationObjectConfig`.

Body: copy the ChartOV function verbatim. Imports: add `ChartOHJsonDataConfig`
to the existing panther import.

Because wb-fastr never sets the axis-label field, the two functions are
functionally identical today. Keeping them separate (rather than sharing)
documents intent and avoids a future "why does the ChartOH builder have a
`yScaleAxisLabel`" confusion.

## 5. Inputs dispatch (step 1.4)

File: [client/src/generate_visualization/get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts)
at [line 168](client/src/generate_visualization/get_figure_inputs_from_po.ts#L168).

The existing `d.type === "chart"` branch always emits `chartData: { jsonArray,
jsonDataConfig }` where the jsonDataConfig comes from the ChartOV builder.
Split on `s.horizontal`:

```typescript
if (effectiveConfig.d.type === "chart") {
  const commonSurrounds = {
    caption: withDateRange(withReplicant(config.t.caption, config, ih.indicatorLabelReplacements), ih.dateRange),
    subCaption: withDateRange(withReplicant(config.t.subCaption, config, ih.indicatorLabelReplacements), ih.dateRange),
    footnote: withDateRange(withReplicant(config.t.footnote, config, ih.indicatorLabelReplacements), ih.dateRange),
    style: getStyleFromPresentationObject(config, resultsValue.formatAs ?? "number"),
  };

  if (effectiveConfig.s.horizontal) {
    return {
      status: "ready",
      data: {
        chartOHData: {
          jsonArray: ih.items,
          jsonDataConfig: getChartOHJsonDataConfigFromPresentationObjectConfig(
            resultsValue,
            effectiveConfig,
            ih.indicatorLabelReplacements,
            ih.items,
          ),
        },
        ...commonSurrounds,
      },
    };
  }

  return {
    status: "ready",
    data: {
      chartData: {
        jsonArray: ih.items,
        jsonDataConfig: getChartOVJsonDataConfigFromPresentationObjectConfig(
          resultsValue,
          effectiveConfig,
          ih.indicatorLabelReplacements,
          ih.items,
        ),
      },
      ...commonSurrounds,
    },
  };
}
```

Add `getChartOHJsonDataConfigFromPresentationObjectConfig` to the existing
import from `./get_data_config_from_po`.

## 6. Style function (step 1.5)

File: [client/src/generate_visualization/get_style_from_po/_1_standard.ts](client/src/generate_visualization/get_style_from_po/_1_standard.ts).

The current style function populates `yScaleAxis` (for ChartOV/Timeseries)
and `xTextAxis` (for ChartOV's category axis). For ChartOH, the same
user-facing flags route to different panther fields:

| User flag | Vertical target | Horizontal target |
| --- | --- | --- |
| `forceYMax1` | `yScaleAxis.max: 1` | `xScaleAxis.max: 1` |
| `forceYMinAuto` | `yScaleAxis.min: "auto"` | `xScaleAxis.min: "auto"` |
| `allowIndividualRowLimits` | `yScaleAxis.allowIndividualTierLimits` | `xScaleAxis.allowIndividualLaneLimits` |
| `verticalTickLabels` | `xTextAxis.verticalTickLabels` | — (no equivalent; ignored) |
| `sortIndicatorValues` | (affects data transform only) | (same) |

Edit the style object to populate both axis blocks. Panther merges
unconditionally and silently drops the axis blocks a given chart type doesn't
consume (`MergedChartOHStyle` reads `xScaleAxis` + `yTextAxis`;
`MergedChartOVStyle` reads `xTextAxis` + `yScaleAxis`; `MergedTimeseriesStyle`
reads `xPeriodAxis` + `yScaleAxis`), so we can set both unconditionally
without hurting ChartOV/Timeseries output:

```typescript
return {
  scale: config.s.scale,
  // …existing fields unchanged…
  xTextAxis: {
    verticalTickLabels: config.s.verticalTickLabels,
    tickPosition: config.s.content === "points" ? "center" : undefined,
  },
  xPeriodAxis: { … },
  yScaleAxis: {
    allowIndividualTierLimits: config.s.allowIndividualRowLimits,
    max: config.s.forceYMax1 ? 1 : undefined,
    min: config.s.forceYMinAuto ? "auto" : undefined,
    tickLabelFormatter: getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0),
  },
  // NEW — mirrored for horizontal charts (silently ignored by ChartOV/Timeseries)
  xScaleAxis: {
    allowIndividualLaneLimits: config.s.allowIndividualRowLimits,
    max: config.s.forceYMax1 ? 1 : undefined,
    min: config.s.forceYMinAuto ? "auto" : undefined,
    tickLabelFormatter: getFormatterFunc(dataFormat, config.s.decimalPlaces ?? 0),
  },
  // yTextAxis intentionally omitted — no user-facing flags map to it today.
  content: { … },
};
```

**Design note:** `allowIndividualRowLimits` is interpreted orientation‑aware:
it means "per-tier (row) variation" in vertical and "per-lane (column)
variation" in horizontal. The user-visible behaviour (each sub-chart gets its
own value range) is the same; the underlying panther field differs by chart
type. If a future change introduces per-lane variation for vertical charts,
add a separate `allowIndividualColLimits` flag then.

Same extension applies to
[_3_percent_change.ts](client/src/generate_visualization/get_style_from_po/_3_percent_change.ts)
if it also sets `yScaleAxis` — mirror the block.

## 7. Slide rendering guard (step 1.6)

File: [client/src/components/slide_deck/slide_rendering/convert_slide_to_page_inputs.ts](client/src/components/slide_deck/slide_rendering/convert_slide_to_page_inputs.ts).

The existing spacer guard around line 383:

```typescript
if (!fi || !(
  "tableData" in fi || "chartData" in fi || "timeseriesData" in fi ||
  "simpleVizData" in fi || "mapData" in fi
)) {
  return { spacer: true };
}
```

Add `"chartOHData" in fi` to the or chain so pages containing ChartOH
figures don't get dropped as spacers.

## 8. Legacy migration — no action

The existing migration block at
[convert_slide_to_page_inputs.ts:394-432](client/src/components/slide_deck/slide_rendering/convert_slide_to_page_inputs.ts#L394-L432)
handles the panther `yScaleAxisData` → `scaleAxisLimits` split for old saved
ChartOV/Timeseries slides. Its guard is `!d.scaleAxisLimits && d.yScaleAxisData`,
so:

- Old ChartOV slides (pre-unification): migrated in place. Renders vertical.
  Unaffected by this plan.
- New ChartOH slides: have `scaleAxisLimits` natively; guard skips them.
- Very old slides with the legacy nested shape AND `horizontal === true`
  (impossible — the flag didn't exist when those were saved): does not occur.

No change needed.

## 9. Testing

**Manual smoke test:**

1. Open a chart presentation object in the editor.
2. Toggle the new "Horizontal" checkbox.
3. Verify: bars render horizontally, category labels on Y, value axis at
   bottom. Switch stacked / grouped / points / lines and confirm each mode
   renders horizontally.
4. Untoggle — chart reverts to vertical, identical to baseline.
5. Save, reload — the `horizontal` flag round-trips.
6. Check an existing saved vertical chart opens unchanged.

**Regression:**

- Run the visual acceptance suite that covers
  [get_figure_inputs_from_po.ts](client/src/generate_visualization/get_figure_inputs_from_po.ts)
  vertical paths. No pixel change expected for `horizontal === undefined`
  slides.

**No new unit tests required** — panther's ChartOH is covered by its own
test suite (`tests/test_chartoh_modes.ts`). wb-fastr integration is a thin
config → input mapping; manual smoke is sufficient.

## 10. Validation

```sh
# In wb-fastr
deno task typecheck          # or equivalent for the project
deno task test               # if there's a test task
```

Build the client, launch locally, run the manual smoke test from §9.

## 11. Non-goals

- **No new `d.type`.** Same chart data type; orientation is a style concern.
- **No per-column variation flag for vertical charts.** If later wanted,
  introduce `s.allowIndividualColLimits` as a separate flag then.
- **No col-group support in ChartOH's Y-text axis.** Panther stub fields
  (`yTextAxis.colGroup*`) are present but ignored by the renderer.
- **No horizontal timeseries or horizontal map.** Out of scope; would need
  separate design work (ChartOH supports time-on-Y patterns in principle,
  but Timeseries uses an X-period axis that has no mirror).

## 12. Sync ordering

1. Land ChartOH in panther (done).
2. Sync panther → wb-fastr's vendored `panther/` directory.
3. Land this plan's changes in wb-fastr (steps 1.1–1.6).
4. Manual smoke test per §9.
5. Ship.

Steps 2 and 3 must be atomic in the wb-fastr commit history — the schema /
UI changes depend on the new panther symbols being importable.
