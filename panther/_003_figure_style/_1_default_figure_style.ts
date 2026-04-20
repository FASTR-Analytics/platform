// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AnchorPoint,
  type CalendarType,
  type CascadeArrowInfo,
  type CascadeArrowInfoFunc,
  type ChartSeriesInfoFunc,
  type ChartValueInfoFunc,
  Color,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  getColor,
  type MapRegionInfoFunc,
  normalizeTo01,
  type PaddingOptions,
  type TableCellInfoFunc,
  toPct0,
  type ValuesColorFunc,
} from "./deps.ts";
import type {
  GenericAreaStyle,
  GenericBarStyle,
  GenericCascadeArrowStyle,
  GenericConfidenceBandStyle,
  GenericDataLabelStyle,
  GenericErrorBarStyle,
  GenericLineStyle,
  GenericMapRegionStyle,
  GenericPointStyle,
  GenericTableCellStyle,
} from "./style_func_types.ts";
import type { LegendPosition } from "./types.ts";

function typed<T>(value: T): T {
  return value;
}

const _DS = {
  scale: 1,

  seriesColorFunc: typed<ChartSeriesInfoFunc<ColorKeyOrString>>(() => ({
    key: "baseContent",
  })),

  valuesColorFunc: typed<ValuesColorFunc>((v, min, max) => {
    if (v === undefined) return "#f0f0f0";
    const t = normalizeTo01(v, min, max);
    return Color.scaledPct(
      getColor({ key: "base200" }),
      getColor({ key: "baseContent" }),
      t,
    );
  }),

  // Surrounds
  surrounds: {
    padding: typed<PaddingOptions>(0),
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
    legendGap: 15,
    legendPosition: typed<LegendPosition>("bottom-left"),
    captionGap: 15,
    subCaptionTopPadding: 7,
    footnoteGap: 15,
    captionAlignH: typed<"left" | "center" | "right">("left"),
    subCaptionAlignH: typed<"left" | "center" | "right">("left"),
    footnoteAlignH: typed<"left" | "center" | "right">("left"),
  },
  // Legend
  legend: {
    legendNoRender: false,
    maxLegendItemsInOneColumn: typed<number | number[]>(3),
    legendColorBoxWidth: 40,
    legendItemVerticalGap: 5,
    legendLabelGap: 10,
    legendPointRadius: 8,
    legendPointStrokeWidth: 3,
    legendLineStrokeWidth: 3,
    legendPointInnerColorStrategy: typed<ColorAdjustmentStrategy>({
      opacity: 0.3,
    }),
    reverseOrder: false,
  },
  // Scale legend
  scaleLegend: {
    barHeight: 12,
    tickLength: 4,
    labelGap: 4,
    blockGap: 1,
    noDataGap: 8,
    noDataSwatchWidth: 24,
  },
  // Table
  table: {
    rowHeaderIndentIfRowGroups: 20,
    verticalColHeaders: typed<"never" | "always" | "auto">("auto"),
    maxHeightForVerticalColHeaders: 300,
    colHeaderPadding: typed<PaddingOptions>(5),
    rowHeaderPadding: typed<PaddingOptions>([5, 10]),
    cellPadding: typed<PaddingOptions>(5),
    alignV: typed<"top" | "middle" | "bottom">("top"),
    colHeaderBackgroundColor: typed<ColorKeyOrString | "none">({
      key: "base100",
    }),
    colGroupHeaderBackgroundColor: typed<ColorKeyOrString | "none">({
      key: "base200",
    }),
    headerBorderWidth: 1,
    gridLineWidth: 1,
    borderWidth: 1,
    headerBorderColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    gridLineColor: typed<ColorKeyOrString>({ key: "base300" }),
    borderColor: typed<ColorKeyOrString>({ key: "base300" }),
  },
  // Lanes
  lanes: {
    hideHeaders: false,
    paddingLeft: 0,
    paddingRight: 0,
    gapX: 10,
    headerAlignH: typed<"left" | "center" | "right">("center"),
    headerGap: 5,
  },
  // X Axis
  xTextAxis: {
    verticalTickLabels: false,
    tickPosition: typed<"sides" | "center">("sides"),
    tickHeight: 10,
    tickLabelGap: 10,
  },
  xScaleAxis: {
    max: typed<number | "auto" | ((i_pane: number) => number)>("auto"),
    min: typed<number | "auto" | ((i_pane: number) => number)>(0),
    labelGap: 10,
    tickHeight: 10,
    tickLabelGap: 5,
    tickLabelFormatter: (v: number): string => (v * 100).toFixed(0) + "%",
    forceRightOverhangWidth: typed<"none" | number>("none"),
    allowIndividualLaneLimits: false,
    exactAxisY: typed<"none" | number>("none"),
  },
  xPeriodAxis: {
    forceSideTicksWhenYear: false,
    showEveryNthTick: 1,
    periodLabelSmallTopPadding: 5,
    periodLabelLargeTopPadding: 5,
    calendar: typed<CalendarType>("gregorian"),
  },
  // Y Axis
  yTextAxis: {
    tickPosition: typed<"sides" | "center">("center"),
    colHeight: 30,
    paddingTop: 0,
    paddingBottom: 0,
    labelGap: 10,
    tickWidth: 10,
    tickLabelGap: 10,
    logicTickLabelWidth: typed<"auto" | "fixed">("auto"),
    logicColGroupLabelWidth: typed<"auto" | "fixed">("auto"),
    maxTickLabelWidthAsPctOfChart: 0.3,
    maxColGroupLabelWidthAsPctOfChart: 0.1,
    colGroupGap: 0,
    colGroupBracketGapLeft: 10,
    colGroupBracketGapRight: 10,
    colGroupBracketPaddingY: 0,
    colGroupBracketTickWidth: 10,
    verticalColGroupLabels: true,
  },
  yScaleAxis: {
    max: typed<number | "auto" | ((i_series: number) => number)>("auto"),
    min: typed<number | "auto" | ((i_series: number) => number)>(0),
    labelGap: 10,
    tickWidth: 10,
    tickLabelGap: 5,
    tickLabelFormatter: (v: number): string => (v * 100).toFixed(0) + "%",
    forceTopOverhangHeight: typed<"none" | number>("none"),
    exactAxisX: typed<"none" | number>("none"),
    allowIndividualTierLimits: false,
  },
  // Content
  content: {
    dataLabel: typed<GenericDataLabelStyle>({
      show: false,
      offset: 3,
      backgroundColor: "none",
      padding: 0,
      borderWidth: 0,
      rectRadius: 0,
    }),
    points: {
      func: typed<GenericPointStyle>({
        show: false,
        pointStyle: "circle",
        radius: 5,
        color: 666,
        strokeWidth: 2,
        innerColorStrategy: { opacity: 0.5 },
        dataLabelPosition: "top",
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
    },
    bars: {
      func: typed<GenericBarStyle>({
        show: false,
        fillColor: 666,
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
      stacking: typed<"none" | "stacked" | "imposed" | "diff">("none"),
      maxBarWidth: 200,
    },
    lines: {
      func: typed<GenericLineStyle>({
        show: false,
        strokeWidth: 3,
        color: 666,
        lineDash: "solid",
        dataLabel: {
          show: false,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<ChartValueInfoFunc<string> | "none">("none"),
      joinAcrossGaps: true,
    },
    areas: {
      func: typed<GenericAreaStyle>({
        show: false,
        to: "zero-line",
        fillColor: 666,
        fillColorAdjustmentStrategy: { opacity: 0.5 },
      }),
      joinAcrossGaps: true,
      diff: {
        enabled: false,
      },
    },
    errorBars: {
      func: typed<GenericErrorBarStyle>({
        show: true,
        strokeColor: { key: "baseContent" },
        strokeWidth: 3,
        capWidthProportion: 0.4,
      }),
    },
    confidenceBands: {
      func: typed<GenericConfidenceBandStyle>({
        show: true,
        fillColor: 666,
        fillColorAdjustmentStrategy: { opacity: 0.15 },
      }),
    },
    cascadeArrows: {
      func: typed<GenericCascadeArrowStyle>({
        show: false,
        strokeColor: { key: "baseContent" },
        strokeWidth: 1.5,
        arrowHeadLength: 6,
        showArrowhead: true,
        arrowLengthPctOfSpace: 0.7,
        arrowLabelGap: 4,
        dataLabel: {
          show: true,
          offset: 3,
          backgroundColor: "none",
          padding: 0,
          borderWidth: 0,
          rectRadius: 0,
        },
      }),
      textFormatter: typed<CascadeArrowInfoFunc<string> | "none">(
        (info: CascadeArrowInfo) => toPct0(info.relRetention),
      ),
    },
    mapRegions: {
      func: typed<GenericMapRegionStyle>({
        show: true,
        fillColor: 777,
        strokeColor: { key: "baseContent" },
        strokeWidth: 1,
        dataLabel: {
          show: false,
          offset: 0,
          backgroundColor: "#ffffff",
          padding: 3,
          borderWidth: 0,
          rectRadius: 0,
        },
        leaderLineStrokeColor: "#666666",
        leaderLineStrokeWidth: 1,
        leaderLineGap: 4,
      }),
      textFormatter: typed<MapRegionInfoFunc<string> | "none">("none"),
    },
    tableCells: {
      func: typed<GenericTableCellStyle>({
        backgroundColor: "none",
        textColorStrategy: "none",
      }),
      textFormatter: typed<TableCellInfoFunc<string> | "none">("none"),
    },
  },
  // Grid
  grid: {
    showGrid: true,
    axisStrokeWidth: 3,
    gridStrokeWidth: 1,
    axisColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    gridColor: typed<ColorKeyOrString>({ key: "base300" }),
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
  },
  // Tiers
  tiers: {
    hideHeaders: false,
    paddingTop: 10,
    paddingBottom: 10,
    gapY: 50,
    maxHeaderWidthAsPctOfChart: 0.3,
    headerAlignH: typed<"left" | "center" | "right">("left"),
    headerAlignV: typed<"top" | "middle">("top"),
    headerPosition: typed<"left" | "above-axis" | "above-plot-area">("left"),
    headerGap: 5,
  },
  // Panes
  panes: {
    hideHeaders: false,
    padding: 0,
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
    headerAlignH: typed<"left" | "center" | "right">("left"),
    headerGap: 5,
    gapX: 15,
    gapY: 15,
    nCols: typed<number | "auto">("auto"),
  },
  // SimpleViz
  simpleviz: {
    layerGap: 150,
    orderGap: 100,
    layerAlign: typed<
      "left" | "center" | "right" | Array<"left" | "center" | "right">
    >("left"),
    boxes: {
      fillColor: typed<ColorKeyOrString>({ key: "base200" }),
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 1,
      alignH: typed<"left" | "center" | "right">("center"),
      alignV: typed<"top" | "middle" | "bottom">("middle"),
      textGap: 10,
      padding: typed<PaddingOptions>(10),
      arrowStartPoint: typed<AnchorPoint>("center"),
      arrowEndPoint: typed<AnchorPoint>("center"),
    },
    arrows: {
      strokeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
      strokeWidth: 2,
      lineDash: typed<"solid" | "dashed">("solid"),
      truncateStart: 10,
      truncateEnd: 10,
    },
  },
  // Sankey
  sankey: {
    nodeWidth: 20,
    nodeGap: 10,
    columnGap: typed<number | "auto">("auto"),
    labelGap: 8,
    linkOpacity: 0.5,
    defaultNodeColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    defaultLinkColor: typed<ColorKeyOrString>({ key: "base300" }),
    layoutMode: typed<"flow" | "tiered">("flow"),
  },
  map: {
    projection: typed<"equirectangular" | "mercator" | "naturalEarth1">(
      "equirectangular",
    ),
    fit: typed<"all-regions" | "only-regions-in-data">("all-regions"),
    boundingBox: typed<[number, number, number, number] | undefined>(undefined),
    dataLabelMode: typed<"none" | "centroid" | "callout" | "auto">("centroid"),
    calloutMargin: 30,
  },
};

export type DefaultFigureStyle = typeof _DS;

export function getDefaultFigureStyle(): DefaultFigureStyle {
  return _DS;
}
