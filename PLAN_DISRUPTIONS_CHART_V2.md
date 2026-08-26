# PLAN: specialDisruptionsChartV2 (m011 Bayesian disruptions)

## Goal

A V2 special disruptions chart for m11-01-01 / m11-01-02 (valueProps:
`observed`, `expected`, `ppi_lwr`, `ppi_upr`):

- observed = solid black line (per V1)
- expected = dashed black line (per V1)
- ppi_lwr..ppi_upr = light grey credible band, always grey
- green shading ONLY where observed > ppi_upr; red ONLY where observed <
  ppi_lwr (diffInverted swaps, per V1)

Reference rendering (RULED correct):
`panther/testing_sandbox/output/disruptions_v2/02_target_with_exceedance_mock.png`
from `testing_sandbox/disruptions_v2_probe.ts` section 3.

## Context (for review)

- V1 disruptions chart to mirror: style builder
  `client/src/generate_visualization/get_style_from_po/_4_disruptions.ts`,
  gating in `client/src/generate_visualization/special_chart_checks.ts`,
  explicit legend branch in
  `client/src/generate_visualization/conditional_formatting.ts`
  (getLegendFromConfig), editor mode radio in
  `client/src/components/visualization/presentation_object_editor_panel_style/_timeseries.tsx`.
- The diff walk to generalize:
  `panther/modules/_007_figure_core/_content/generate_area_primitives.ts`
  (else-branch, `s.areas.diff.enabled`); current attribution over → 0 /
  under → 1 at the `order === "over" ? 0 : 1` line.
- Probe: `panther/testing_sandbox/disruptions_v2_probe.ts`
  (`deno run -A` from the panther repo root). Section 3's PNG (02) is the
  visual oracle; section 4's PNG (03) is the known-wrong clamped-series
  attempt.
- m011 metric definitions (valueProps + presets to update):
  `wb-fastr-modules/m011/_metrics/m11-01-01.ts` / `m11-01-02.ts`.

## Design: generalize panther's areas.diff to explicit series pairs

The V1 diff walk (`generate_area_primitives.ts`) is the established
mechanism — over/under segmentation with crossing-point interpolation —
but it is hardcoded to series 0 vs 1, always emits both sides, and its
attribution is fixed (over → i_series 0, under → 1). Generalize it:

```ts
areas?: {
  func?: ...;
  joinAcrossGaps?: boolean;
  diff?: {
    enabled?: boolean;
    // Each pair shades between series a and b where the emit condition
    // holds. Areas are styled via the areas func with i_series = a for
    // "over" areas (a above b) and i_series = b for "under" areas.
    // Absent pairs = [{ series: [0, 1], emit: "both" }], which IS the
    // current behavior (V1 disruptions unchanged).
    pairs?: { series: [number, number]; emit: "over" | "under" | "both" }[];
  };
};
```

Implementation: refactor the existing 0-vs-1 walk into a helper taking
(a, b, emit); loop over pairs, emitting primitives in pair order (so an
earlier pair renders beneath a later one at the shared zIndex).

With pairs, V2 needs NO pivot, NO uncertainty config, and NO
confidenceBands — the wide 4-series shape is used as-is:

- transform: valueProps `["observed", "expected", "ppi_lwr", "ppi_upr"]`,
  `seriesProp: "--v"` (natural FASTR shape; series order = declared order)
- lines: series 0 solid 3px, series 1 dashed 1.5px, series 2 + 3 hidden
- areas.diff.pairs (in render order):
  1. `{ series: [3, 2], emit: "over" }` — upr vs lwr, always over →
     styled i_series 3 → grey band
  2. `{ series: [0, 3], emit: "over" }` — observed above upr → styled
     i_series 0 → green (red when diffInverted)
  3. `{ series: [0, 2], emit: "under" }` — observed below lwr → styled
     i_series 2 → red (green when diffInverted)
- areas style func keyed by attribution index: 0 → green, 2 → red,
  3 → grey (0/2 swapped by diffInverted)

Because each pair interpolates crossings against the REAL bound polyline,
the geometry is exact — identical to the section-3 mock (02).

Style options are runtime TS (never serialized), so the pairs config
touches no zod schema, no stored figures, no cache shapes.

## Dead ends, probed and rejected (probe sections 1, 4)

- Prop-based uncertainty (`ubValueProps`/`lbValueProps`) with
  `seriesProp: "--v"`: bounds fill looks up the series header by the
  bounds prop name (`getHeaderIndex`, `common_data_transform.ts:61`) →
  `i_series >= 0` assert. Row-based uncertainty + pivot (section 2) does
  render a band, but is superseded by the pairs design (no pivot needed).
- Clamped synthetic series + existing 0-vs-1 diff (section 4 /
  `03_pure_panther_clamped_diff.png`): WRONG — leaving the "equal" state
  anchors the polygon at the previous observed point, so red/green wedges
  bleed inside the band at every entry/exit. Ruled out 2026-08-26.

Fetch layer untouched throughout: metric valueProps stay all four; this
is display-layer only (no fetch-config/cache-hash impact).

## Step 1 — panther: diff pairs

1. `_003_figure_style` types: `diff.pairs` as above (optional; absent =
   `[{ series: [0, 1], emit: "both" }]`).
2. `generate_area_primitives.ts`: extract the 0-vs-1 walk into a
   per-pair helper (a, b, emit + attribution); loop pairs in order.
3. Probe section 5: render the pairs config, assert parity with the
   section-3 polygon geometry (crossings on the band edges), and
   re-run existing V1-shaped diff (no pairs) unchanged.
4. Panther typecheck → `./sync` into the app (stage app changes first,
   confirm no parallel workstreams in the sync diff).

## Step 2 — app + modules

1. **Config flag** `specialDisruptionsChartV2` (`z.boolean().optional()`,
   read `?? false` — showNValues precedent, no migration):
   - `lib/types/_presentation_object_config.ts` (s strict schema)
   - `lib/types/_module_definition_github.ts` + `_metric_installed.ts`
     preset s schemas (both `.partial()` — additive)
   - `wb-fastr-modules/.validation/_module_definition_github.ts` (mirror)
2. **special_chart_checks.ts**:
   `SPECIAL_DISRUPTIONS_CHART_V2_METRICS = ["m11-01-01", "m11-01-02"]`,
   `canUseSpecialDisruptionsChartV2`, `isSpecialDisruptionsChartV2Active`
   (flag + timeseries). Deliberately NOT added to
   `ALLOW_NEGATIVE_SCALE_VALUES_METRICS`: unlike M3's expected-volume
   model, the M11 NegBin model and its bounds are non-negative by
   construction.
3. **build_figure_inputs.ts**: V2 guard (like the V1 length<2 guard) —
   `effectiveValueProps` must be EXACTLY
   `["observed", "expected", "ppi_lwr", "ppi_upr"]` in that order. The
   pairs' indices are positions on the series axis, which under "--v" is
   the effective value-props order — a user-filtered subset or reorder
   would silently pair the wrong series, so fail with a clear message
   instead. No data reshaping.
4. **get_style_from_po/_6_disruptions_v2.ts**: lines + areas.diff.pairs
   exactly as the design above; diffInverted swaps green/red; same
   axis/pane/text options as V1. Dispatch in `get_style_from_po.ts`.
   Verify hidden series (2, 3) emit no data labels.
5. **Legend** (`conditional_formatting.ts` getLegendFromConfig): explicit
   legend per V1 idiom — Observed (solid line), Expected (dashed line),
   95% credible interval (grey swatch), Surplus (green), Deficit (red);
   diffInverted swaps green/red.
6. **Editor**: `_timeseries.tsx` new mode `disruptions-v2` (radio label,
   period radio + invert checkbox + labels + axis sections, content →
   "lines"); `presentation_object_editor_panel_style.tsx` passes
   `showDisruptionsModeV2`.
7. **wb-fastr-modules m011**: vizPresets in m11-01-01/02 set
   `specialDisruptionsChartV2: true` (content "lines"), update
   label/description; `deno task build`.
   Lockstep order: app deploys BEFORE modules push — an old app's strip
   parse would silently drop the unknown preset key at install.

## Gates

- Panther typecheck + probe (section 5 parity + V1-shape regression)
  before `./sync`; `deno task typecheck` (app); modules
  `deno task build`.
