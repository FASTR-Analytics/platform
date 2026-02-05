// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AnchorPoint,
  type CalendarType,
  type ChartSeriesInfoFunc,
  type ChartValueInfoFunc,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  type PaddingOptions,
  toPct1,
} from "./deps.ts";
import type {
  GenericAreaStyle,
  GenericAreaStyleOptions,
  GenericBarStyle,
  GenericBarStyleOptions,
  GenericLineStyle,
  GenericLineStyleOptions,
  GenericPointStyle,
  TableCellFormatterFunc,
} from "./style_func_types.ts";
import type { AspectRatio, LegendPosition } from "./types.ts";

const _DS = {
  scale: 1,

  idealAspectRatio: "video" as "none" | AspectRatio,
  seriesColorFunc: (() => ({
    key: "baseContent",
  })) as ChartSeriesInfoFunc<ColorKeyOrString>,

  hideColHeaders: false,
  chartAreaBackgroundColor: "none" as ColorKeyOrString | "none",

  // Surrounds
  surrounds: {
    padding: 0 as PaddingOptions,
    backgroundColor: "none" as ColorKeyOrString | "none",
    legendGap: 15,
    legendPosition: "bottom-left" as LegendPosition,
    captionGap: 15,
    subCaptionTopPadding: 7,
    footnoteGap: 15,
  },
  // Legend
  legend: {
    legendNoRender: false,
    maxLegendItemsInOneColumn: 3 as number | number[],
    legendColorBoxWidth: 40,
    legendItemVerticalGap: 5,
    legendLabelGap: 10,
    legendPointRadius: 8,
    legendPointStrokeWidth: 3,
    legendLineStrokeWidth: 3,
    legendPointInnerColorStrategy: {
      opacity: 0.3,
    } as ColorAdjustmentStrategy,
    reverseOrder: false,
  },
  // Table
  table: {
    rowHeaderIndentIfRowGroups: 20,
    verticalColHeaders: "auto" as "never" | "always" | "auto",
    maxHeightForVerticalColHeaders: 180,
    colHeaderPadding: 5 as PaddingOptions,
    rowHeaderPadding: [5, 10] as PaddingOptions,
    cellPadding: 5 as PaddingOptions,
    cellVerticalAlign: "top" as "top" | "middle" | "bottom",
    colHeaderBackgroundColor: { key: "base100" } as ColorKeyOrString | "none",
    colGroupHeaderBackgroundColor: { key: "base200" } as
      | ColorKeyOrString
      | "none",
    cellBackgroundColorFormatter: "none" as
      | "none"
      | TableCellFormatterFunc<
        string | number | null | undefined,
        ColorKeyOrString
      >,
    cellValueFormatter: ((v) => toPct1(v)) as TableCellFormatterFunc<
      string | number | null | undefined,
      string
    >,
    headerBorderWidth: 1,
    gridLineWidth: 1,
    borderWidth: 1,
    headerBorderColor: { key: "baseContent" } as ColorKeyOrString,
    gridLineColor: { key: "base300" } as ColorKeyOrString,
    borderColor: { key: "base300" } as ColorKeyOrString,
  },
  // X Axis
  xTextAxis: {
    verticalTickLabels: false,
    tickPosition: "sides" as "sides" | "center",
    tickHeight: 10,
    tickLabelGap: 10,
    lanePaddingLeft: 10,
    lanePaddingRight: 0,
    laneGapX: 10,
  },
  xPeriodAxis: {
    lanePaddingLeft: 10,
    lanePaddingRight: 0,
    laneGapX: 10,
    forceSideTicksWhenYear: false,
    showEveryNthTick: 1,
    calendar: "gregorian" as CalendarType,
  },
  // Y Axis
  yTextAxis: {
    colHeight: 30,
    paddingTop: 0,
    paddingBottom: 0,
    labelGap: 10,
    tickWidth: 10,
    tickLabelGap: 10,
    logicTickLabelWidth: "auto" as "auto" | "fixed",
    logicColGroupLabelWidth: "auto" as "auto" | "fixed",
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
    max: "auto" as number | "auto" | ((i_series: number) => number),
    min: 0 as number | "auto" | ((i_series: number) => number),
    labelGap: 10,
    tickWidth: 10,
    tickLabelGap: 5,
    tickLabelFormatter: (v: number): string => (v * 100).toFixed(0) + "%",
    forceTopOverhangHeight: "none" as "none" | number,
    exactAxisX: "none" as "none" | number,
    allowIndividualTierLimits: false,
  },
  // Content
  content: {
    points: {
      defaults: {
        show: false,
        pointStyle: "circle",
        radius: 5,
        color: 666,
        strokeWidth: 2,
        innerColorStrategy: { opacity: 0.5 },
        dataLabelPosition: "top",
      } as GenericPointStyle,
      func: "none" as ChartValueInfoFunc<GenericPointStyle> | "none",
    },
    bars: {
      defaults: {
        show: false,
        fillColor: 666,
      } as GenericBarStyle,
      func: "none" as ChartValueInfoFunc<GenericBarStyleOptions> | "none",
      stacking: "none" as
        | "none"
        | "stacked"
        | "imposed"
        | "uncertainty"
        | "uncertainty-tiers",
      maxBarWidth: 200,
    },
    lines: {
      defaults: {
        show: false,
        strokeWidth: 3,
        color: 666,
        lineDash: "solid",
      } as GenericLineStyle,
      func: "none" as ChartSeriesInfoFunc<GenericLineStyleOptions> | "none",
      joinAcrossGaps: true,
    },
    areas: {
      defaults: {
        show: false,
        to: "zero-line",
        fillColor: 666,
        fillColorAdjustmentStrategy: { opacity: 0.5 },
      } as GenericAreaStyle,
      func: "none" as ChartSeriesInfoFunc<GenericAreaStyleOptions> | "none",
      diff: {
        enabled: false,
        // order: "actual-expected" as "actual-expected" | "expected-actual",
      },
    },
    withDataLabels: true,
    dataLabelFormatter: ((v) => toPct1(v.val)) as ChartValueInfoFunc<
      string | undefined
    >,
  },
  // Grid
  grid: {
    showGrid: true,
    axisStrokeWidth: 3,
    gridStrokeWidth: 1,
    axisColor: { key: "baseContent" } as ColorKeyOrString,
    gridColor: { key: "base300" } as ColorKeyOrString,
  },
  // Panes
  panes: {
    padding: 0,
    backgroundColor: "none" as ColorKeyOrString | "none",
    headerAlignment: "left" as "left" | "center" | "right",
    headerGap: 5,
    gapX: 15,
    gapY: 15,
    nCols: "auto" as number | "auto",
  },
  // SimpleViz
  simpleviz: {
    layerGap: 150,
    orderGap: 100,
    layerAlign: "left" as
      | "left"
      | "center"
      | "right"
      | Array<"left" | "center" | "right">,
    boxes: {
      fillColor: { key: "base200" } as ColorKeyOrString,
      strokeColor: { key: "baseContent" } as ColorKeyOrString,
      strokeWidth: 1,
      textHorizontalAlign: "center" as "left" | "center" | "right",
      textVerticalAlign: "center" as "top" | "center" | "bottom",
      textGap: 10,
      padding: 10 as PaddingOptions,
      arrowStartPoint: "center" as AnchorPoint,
      arrowEndPoint: "center" as AnchorPoint,
    },
    arrows: {
      strokeColor: { key: "baseContent" } as ColorKeyOrString,
      strokeWidth: 2,
      lineDash: "solid" as "solid" | "dashed",
      truncateStart: 10,
      truncateEnd: 10,
    },
  },
  // Sankey
  sankey: {
    nodeWidth: 20,
    nodeGap: 10,
    columnGap: "auto" as number | "auto",
    labelGap: 8,
    linkOpacity: 0.5,
    defaultNodeColor: { key: "baseContent" } as ColorKeyOrString,
    defaultLinkColor: { key: "base300" } as ColorKeyOrString,
    layoutMode: "flow" as "flow" | "tiered",
  },
};

export type DefaultFigureStyle = typeof _DS;

export function getDefaultFigureStyle(): DefaultFigureStyle {
  return _DS;
}
