# Special Chart Modes

## Overview

Presentation objects support "special chart modes" that override most standard style properties with hardcoded rendering logic. Each mode is a self-contained style builder that produces a complete `CustomFigureStyleOptions` object. Currently all special modes are timeseries-based, but the same pattern applies to any presentation type (e.g. scorecard for tables).

## Modes

| Mode | Boolean flag | Metrics | Content type | Key behavior |
|---|---|---|---|---|
| Standard | (none) | All | User-selected | All config.s properties apply |
| Coverage | `specialCoverageChart` | m4-01-01, m6-01-01, m6-02-01, m6-03-01 | lines | Hardcoded series colors (black/red/grey), forced points with toPct0 last-value labels, yearly period |
| Percent change | `specialBarChart` | m3-01-01 | bars | Hardcoded bar colors (red/green/comparison) based on period-to-period diff, threshold-based labeling |
| Disruptions | `specialDisruptionsChart` | m3-02-01, m3-03-01, m3-04-01, m3-05-01 | areas | Hardcoded red/green diff areas, black solid/dashed lines for actual vs expected |
| Scorecard | `specialScorecardTable` | (TODO) | table | Currently delegates to standard — not yet extracted |

## Architecture

### UI (`client/src/components/visualization/presentation_object_editor_panel_style/`)

- **Dispatcher** (`..._style.tsx`): Gates mode availability by metric ID using consts from `_0_conditional_consts.ts`
- **Timeseries** (`_timeseries.tsx`): RadioGroup at top selects mode. Each mode's Match block shows only the controls the renderer actually reads. Hidden controls are forced to safe defaults on mode switch via `setMode()`.

### Renderer (`client/src/generate_visualization/get_style_from_po/`)

- **Dispatcher** (`get_style_from_po.ts`): Checks special booleans in priority order, delegates to per-mode builder
- **Per-mode builders** (`_1_standard.ts` through `_5_scorecard.ts`): Each builds a complete style object. Mode-specific properties are hardcoded; shared layout is duplicated for explicitness
- **Common helpers** (`_0_common.ts`): Text style, table layout, table cells, map regions, standard series color func, map color func

### Legend (`client/src/generate_visualization/conditional_formatting.ts`)

`getLegendItemsFromConfig()` checks the same special booleans and returns hardcoded legend items per mode.

### Metric gating (`_0_conditional_consts.ts`)

Metric ID arrays control which modes appear in the UI RadioGroup. If a mode is active (e.g. from a saved config) but the metric isn't in the allowed list, the option still appears so the user can switch away.

## Override rule

When a special mode is active, it **overrides** all hidden properties. The `setMode()` function forces hidden properties to safe defaults (e.g. `hideLegend=false`, `barsStacked=false`). The renderer hardcodes these same values as a safety net for saved configs that weren't migrated via the UI.

## Legacy: diffAreas

`diffAreas` was the original boolean for disruptions mode. It is deprecated in favor of `specialDisruptionsChart`. A legacy adapter recognizes `content === "areas" && diffAreas` in the renderer, legend, and UI mode getter. When the user touches the mode selector, `diffAreas` is cleared and `specialDisruptionsChart` is set. All legacy adapter lines are marked with `// Legacy adapter — remove once all configs migrated`.
