// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Dead-option guard: every key on the custom options type must land on a
// merged type. A key that fails here was added to `_2_custom_*` without a
// merge line (or its merged field was never declared). Each exemption below
// names a deliberate custom→merged shape difference; add to it only when the
// option is genuinely consumed by another route.
import type {
  AssertNoMissingKeys,
  MissingKeyPaths,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { CustomFigureStyleOptions } from "./_2_custom_figure_style_options.ts";
import type {
  MergedChartStyleBase,
  MergedContentStyle,
  MergedGridStyle,
  MergedIdealHeightStyle,
  MergedLegendStyle,
  MergedMapStyle,
  MergedPaneStyle,
  MergedPieStyle,
  MergedSankeyStyle,
  MergedScaleLegendStyle,
  MergedSimpleVizStyle,
  MergedSurroundsStyle,
  MergedTableStyle,
  MergedVizGraphStyle,
  MergedXPeriodAxisStyle,
  MergedXScaleAxisStyle,
  MergedXTextAxisStyle,
  MergedYScaleAxisStyle,
  MergedYTextAxisStyle,
} from "./_3_merged_style_return_types.ts";
import type { FigureTextStyleKey } from "./text_style_keys.ts";

type C<K extends keyof CustomFigureStyleOptions> = NonNullable<
  CustomFigureStyleOptions[K]
>;

type Missing<
  K extends keyof CustomFigureStyleOptions,
  M,
  Exempt extends string = never,
> = Exclude<MissingKeyPaths<C<K>, M>, Exempt>;

// `content.<block>.func` is authored as `func` and merged as `getStyle`;
// `content.dataLabel` is the shared cascade base folded into every block's
// getStyle (`resolveDataLabelDefaults`); the three table blocks are merged
// onto MergedTableStyle, not MergedContentStyle.
type MergedContentAndTableBlocks =
  & MergedContentStyle
  & Pick<
    MergedTableStyle,
    "tableCells" | "tableRowHeaders" | "tableColHeaders"
  >;

// `table.alignV` is the table-wide fallback read straight from the option
// levels inside the header/cell style funcs (style_func_types.ts), so it has
// no merged field of its own.
type TableExempt = "alignV";

export type FigureStyleKeyCoverage = {
  surrounds: AssertNoMissingKeys<Missing<"surrounds", MergedSurroundsStyle>>;
  legend: AssertNoMissingKeys<Missing<"legend", MergedLegendStyle>>;
  scaleLegend: AssertNoMissingKeys<
    Missing<"scaleLegend", MergedScaleLegendStyle>
  >;
  table: AssertNoMissingKeys<Missing<"table", MergedTableStyle, TableExempt>>;
  tiers: AssertNoMissingKeys<Missing<"tiers", MergedChartStyleBase["tiers"]>>;
  lanes: AssertNoMissingKeys<Missing<"lanes", MergedChartStyleBase["lanes"]>>;
  xTextAxis: AssertNoMissingKeys<Missing<"xTextAxis", MergedXTextAxisStyle>>;
  xScaleAxis: AssertNoMissingKeys<
    Missing<"xScaleAxis", MergedXScaleAxisStyle>
  >;
  xPeriodAxis: AssertNoMissingKeys<
    Missing<"xPeriodAxis", MergedXPeriodAxisStyle>
  >;
  yTextAxis: AssertNoMissingKeys<Missing<"yTextAxis", MergedYTextAxisStyle>>;
  yScaleAxis: AssertNoMissingKeys<
    Missing<"yScaleAxis", MergedYScaleAxisStyle>
  >;
  content: AssertNoMissingKeys<
    Missing<
      "content",
      MergedContentAndTableBlocks,
      "dataLabel" | `${string}.func`
    >
  >;
  grid: AssertNoMissingKeys<Missing<"grid", MergedGridStyle>>;
  panes: AssertNoMissingKeys<Missing<"panes", MergedPaneStyle>>;
  simpleviz: AssertNoMissingKeys<Missing<"simpleviz", MergedSimpleVizStyle>>;
  vizgraph: AssertNoMissingKeys<Missing<"vizgraph", MergedVizGraphStyle>>;
  sankey: AssertNoMissingKeys<Missing<"sankey", MergedSankeyStyle>>;
  map: AssertNoMissingKeys<Missing<"map", MergedMapStyle["map"]>>;
  pie: AssertNoMissingKeys<Missing<"pie", MergedPieStyle["pie"]>>;
  idealHeight: AssertNoMissingKeys<
    Missing<"idealHeight", MergedIdealHeightStyle>
  >;
  text: AssertNoMissingKeys<Exclude<FigureTextStyleKey, MergedFigureTextKey>>;
};

// Every FIGURE_TEXT_STYLE_KEYS entry must be picked into some merged `text`
// block. Renamed landings are listed explicitly (key → merged field). `base`
// is the root every other text is derived from (`getBaseTextInfo`), not a
// picked field.
type MergedFigureTextKey =
  | "base"
  | keyof MergedChartStyleBase["text"]
  | keyof MergedSurroundsStyle["text"]
  | keyof MergedTableStyle["text"]
  | keyof MergedXTextAxisStyle["text"]
  | keyof MergedXScaleAxisStyle["text"]
  | keyof MergedXPeriodAxisStyle["text"]
  | keyof MergedYTextAxisStyle["text"]
  | keyof MergedYScaleAxisStyle["text"]
  | keyof MergedPieStyle["pie"]["text"]
  | (MergedLegendStyle["text"] extends TextInfoUnkeyed ? "legend" : never)
  | (MergedSimpleVizStyle["text"]["primary"] extends TextInfoUnkeyed
    ? "simplevizBoxTextPrimary"
    : never)
  | (MergedSimpleVizStyle["text"]["secondary"] extends TextInfoUnkeyed
    ? "simplevizBoxTextSecondary"
    : never)
  | (MergedVizGraphStyle["text"]["primary"] extends TextInfoUnkeyed
    ? "vizgraphNodeTextPrimary"
    : never)
  | (MergedVizGraphStyle["text"]["secondary"] extends TextInfoUnkeyed
    ? "vizgraphNodeTextSecondary"
    : never)
  | (MergedVizGraphStyle["text"]["groupLabel"] extends TextInfoUnkeyed
    ? "vizgraphGroupLabel"
    : never);
