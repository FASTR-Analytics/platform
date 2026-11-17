// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  type CalendarType,
  type CascadeArrowInfoFunc,
  type ChartConnectorInfoFunc,
  type ChartSeriesInfoFunc,
  type ChartValueInfoFunc,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  type DiagramBadgeInfoFunc,
  type DiagramEdgeInfoFunc,
  type DiagramNodeInfoFunc,
  type DiagramTextInfoFunc,
  type MapAreaInfoFunc,
  type PaddingOptions,
  type PieSliceInfoFunc,
  type TableCellInfoFunc,
  type TableHeaderInfoFunc,
  type TickLabelFormatterOption,
} from "./deps.ts";
import type {
  AreaDiffPair,
  ArrowheadFitFallback,
  FigureValuesColorFunc,
  GenericAreaStyleOptions,
  GenericBarStyleOptions,
  GenericCascadeArrowStyleOptions,
  GenericConnectorStyleOptions,
  GenericDataLabelStyleOptions,
  GenericErrorBandStyleOptions,
  GenericErrorBarStyleOptions,
  GenericLineStyleOptions,
  GenericMapAreaStyleOptions,
  GenericPieSliceStyleOptions,
  GenericPointStyleOptions,
  GenericTableCellStyleOptions,
  GenericTableHeaderStyleOptions,
} from "./style_func_types.ts";
import type { FigureTextStyleOptions } from "./text_style_keys.ts";
import type { LegendPosition } from "./types.ts";

export type CustomFigureStyleOptions = {
  seriesColorFunc?: ChartSeriesInfoFunc<ColorKeyOrString>;
  valuesColorFunc?: FigureValuesColorFunc;

  text?: FigureTextStyleOptions;
  surrounds?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString | "none";
    legendGap?: number;
    legendPosition?: LegendPosition;
    titleGap?: number;
    subtitleTopPadding?: number;
    footnoteGap?: number;
    titleAlignH?: "left" | "center" | "right";
    subtitleAlignH?: "left" | "center" | "right";
    footnoteAlignH?: "left" | "center" | "right";
  };
  legend?: {
    legendNoRender?: boolean;
    maxLegendEntriesInOneColumn?: number | number[];
    reverseOrder?: boolean;
    legendColorBoxWidth?: number;
    legendEntryVerticalGap?: number;
    legendLabelGap?: number;
    legendPointRadius?: number;
    legendPointStrokeWidth?: number;
    legendLineStrokeWidth?: number;
    legendPointInnerColorStrategy?: ColorAdjustmentStrategy;
  };
  scaleLegend?: {
    barHeight?: number;
    tickLength?: number;
    labelGap?: number;
    blockGap?: number;
    noDataGap?: number;
    noDataSwatchWidth?: number;
    minBarWidth?: number;
  };
  table?: {
    rowHeaderIndentIfRowGroups?: number;
    verticalColHeaders?: "never" | "always" | "auto";
    maxHeightForVerticalColHeaders?: number;
    colHeaderPadding?: PaddingOptions;
    rowHeaderPadding?: PaddingOptions;
    cellPadding?: PaddingOptions;
    headerBorderWidth?: number;
    gridLineWidth?: number;
    borderWidth?: number;
    headerBorderColor?: ColorKeyOrString;
    gridLineColor?: ColorKeyOrString;
    borderColor?: ColorKeyOrString;
  };
  tiers?: {
    hideHeaders?: boolean;
    paddingTop?: number;
    paddingBottom?: number;
    gapY?: number;
    maxHeaderWidthFractionOfPane?: number;
    headerAlignH?: "left" | "center" | "right";
    headerAlignV?: "top" | "middle";
    headerPosition?:
      | "left"
      | "above-axis"
      | "above-sub-chart"
      | "above-axis-if-no-lanes"
      | "above-sub-chart-if-no-lanes";
    headerGap?: number;
  };
  lanes?: {
    hideHeaders?: boolean;
    paddingLeft?: number;
    paddingRight?: number;
    gapX?: number;
    headerAlignH?: "left" | "center" | "right";
    headerGap?: number;
  };
  xTextAxis?: {
    verticalTickLabels?: boolean;
    tickPosition?: "sides" | "center";
    tickLength?: number;
    tickLabelGap?: number;
    maxTickLabelHeightFractionOfPane?: number;
  };
  xValueAxis?: {
    max?: number | "auto" | "auto-zero" | ((i_pane: number) => number);
    min?: number | "auto" | "auto-zero" | ((i_pane: number) => number);
    axisLabelGap?: number;
    tickLength?: number;
    tickLabelGap?: number;
    tickLabelFormatter?: TickLabelFormatterOption;
    tickLabelAlignment?: "center" | "inset";
    allowIndividualLaneLimits?: boolean;
    exactAxisY?: "none" | number;
  };
  xPeriodAxis?: {
    forceSideTicksWhenYear?: boolean;
    showEveryNthTick?: number;
    periodLabelSmallTopPadding?: number;
    periodLabelLargeTopPadding?: number;
    calendar?: CalendarType;
  };
  yTextAxis?: {
    tickPosition?: "sides" | "center";
    paddingTop?: number;
    paddingBottom?: number;
    tickLength?: number;
    tickLabelGap?: number;
    maxTickLabelWidthFractionOfPane?: number;
  };
  yValueAxis?: {
    max?: number | "auto" | "auto-zero" | ((i_pane: number) => number);
    min?: number | "auto" | "auto-zero" | ((i_pane: number) => number);
    axisLabelGap?: number;
    tickLength?: number;
    tickLabelGap?: number;
    tickLabelFormatter?: TickLabelFormatterOption;
    tickLabelAlignment?: "center" | "inset";
    exactAxisX?: "none" | number;
    allowIndividualTierLimits?: boolean;
  };
  content?: {
    dataLabel?: GenericDataLabelStyleOptions;
    points?: {
      func?:
        | GenericPointStyleOptions
        | ChartValueInfoFunc<GenericPointStyleOptions>
        | "none";
      textFormatter?: ChartValueInfoFunc<string> | "none";
    };
    bars?: {
      func?:
        | GenericBarStyleOptions
        | ChartValueInfoFunc<GenericBarStyleOptions>
        | "none";
      textFormatter?: ChartValueInfoFunc<string> | "none";
      stacking?:
        | "none"
        | "stacked"
        | "imposed"
        | "diff";
      maxBarWidth?: number;
    };
    lines?: {
      func?:
        | GenericLineStyleOptions
        | ChartSeriesInfoFunc<GenericLineStyleOptions>
        | "none";
      textFormatter?: ChartValueInfoFunc<string> | "none";
      joinAcrossGaps?: boolean;
    };
    areas?: {
      func?:
        | GenericAreaStyleOptions
        | ChartSeriesInfoFunc<GenericAreaStyleOptions>
        | "none";
      joinAcrossGaps?: boolean;
      diff?: {
        enabled?: boolean;
        pairs?: AreaDiffPair[];
      };
    };
    errorBars?: {
      func?:
        | GenericErrorBarStyleOptions
        | ChartValueInfoFunc<GenericErrorBarStyleOptions>
        | "none";
    };
    errorBands?: {
      func?:
        | GenericErrorBandStyleOptions
        | ChartSeriesInfoFunc<GenericErrorBandStyleOptions>
        | "none";
    };
    cascadeArrows?: {
      func?:
        | GenericCascadeArrowStyleOptions
        | CascadeArrowInfoFunc<GenericCascadeArrowStyleOptions>
        | "none";
      textFormatter?: CascadeArrowInfoFunc<string> | "none";
    };
    connectors?: {
      func?:
        | GenericConnectorStyleOptions
        | ChartConnectorInfoFunc<GenericConnectorStyleOptions>
        | "none";
      joinAcrossGaps?: boolean;
      arrowheadFitFallback?: ArrowheadFitFallback;
    };
    mapAreas?: {
      func?:
        | GenericMapAreaStyleOptions
        | MapAreaInfoFunc<GenericMapAreaStyleOptions>
        | "none";
      textFormatter?: MapAreaInfoFunc<string> | "none";
    };
    slices?: {
      func?:
        | GenericPieSliceStyleOptions
        | PieSliceInfoFunc<GenericPieSliceStyleOptions>
        | "none";
      textFormatter?: PieSliceInfoFunc<string> | "none";
    };
    tableCells?: {
      func?:
        | GenericTableCellStyleOptions
        | TableCellInfoFunc<GenericTableCellStyleOptions>
        | "none";
      textFormatter?: TableCellInfoFunc<string> | "none";
    };
    tableRowHeaders?: {
      func?:
        | GenericTableHeaderStyleOptions
        | TableHeaderInfoFunc<GenericTableHeaderStyleOptions>
        | "none";
      // Rewrites the final header label (receives the RAW label + sampleN).
      // Applies to item AND group headers on this side. Invoked for every
      // header with a defined label; must be pure and deterministic —
      // label-derived width caches assume it. An "" return demotes a
      // row-GROUP header entirely (truthiness guard); on every other header
      // kind it renders an empty label with its space still reserved — same as
      // an authored "" label.
      textFormatter?: TableHeaderInfoFunc<string> | "none";
    };
    tableColHeaders?: {
      func?:
        | GenericTableHeaderStyleOptions
        | TableHeaderInfoFunc<GenericTableHeaderStyleOptions>
        | "none";
      textFormatter?: TableHeaderInfoFunc<string> | "none";
    };
  };
  grid?: {
    showGridLines?: boolean;
    axisStrokeWidth?: number;
    gridLineStrokeWidth?: number;
    axisColor?: ColorKeyOrString;
    gridLineColor?: ColorKeyOrString;
    backgroundColor?: ColorKeyOrString | "none";
  };
  panes?: {
    hideHeaders?: boolean;
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString | "none";
    headerGap?: number;
    headerAlignH?: "left" | "center" | "right";
    gapX?: number;
    gapY?: number;
    nCols?: number | "auto";
    // The pane width the automatic column count packs to, in design units.
    minWidth?: number;
  };

  // Scene (hand-built figures and diagrams; the element model). Text via
  // text.sceneBoxTitle, sceneBoxSub, sceneBoxLine, sceneBadge,
  // sceneRegionLabel, sceneConnectorLabel and sceneText.
  scene?: {
    boxes?: {
      fillColor?: ColorKeyOrString;
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      rectRadius?: number;
      padding?: PaddingOptions;
      // Between a box's title, sub, lines and badges.
      textGap?: number;
      // Between boxes in a stack or a row.
      gap?: number;
      alignH?: "left" | "center" | "right";
    };
    // Pills inside a box and standalone pills.
    badges?: {
      fillColor?: ColorKeyOrString;
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      padding?: PaddingOptions;
      gap?: number;
    };
    connectors?: {
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      lineDash?: "solid" | "dashed";
      headSize?: number;
      // The clearance between a box's edge and a connector's endpoint.
      gap?: number;
      cornerRadius?: number;
      labelFillColor?: ColorKeyOrString;
      labelPadding?: PaddingOptions;
    };
    regions?: {
      labelInset?: number;
      rect?: {
        fillColor?: ColorKeyOrString;
        strokeColor?: ColorKeyOrString;
        strokeWidth?: number;
        rectRadius?: number;
      };
      panel?: {
        fillColor?: ColorKeyOrString;
        strokeColor?: ColorKeyOrString;
        strokeWidth?: number;
        rectRadius?: number;
      };
      band?: {
        fillColor?: ColorKeyOrString;
        strokeColor?: ColorKeyOrString;
        strokeWidth?: number;
        rectRadius?: number;
      };
      bracket?: {
        strokeColor?: ColorKeyOrString;
        strokeWidth?: number;
        depth?: number;
      };
      ring?: {
        fillColor?: ColorKeyOrString;
        strokeColor?: ColorKeyOrString;
        strokeWidth?: number;
        rectRadius?: number;
      };
    };
  };
  // Diagram (a scene laid out from data; its chrome is the scene block's).
  // The callbacks are resolved before layout, so a strokeWidth or a
  // thickness they return folds into the measured layout.
  diagram?: {
    maxNodeTextWidth?: number;
    groupPad?: number;
    nodeInfo?: DiagramNodeInfoFunc;
    badgeInfo?: DiagramBadgeInfoFunc;
    edgeInfo?: DiagramEdgeInfoFunc;
    textInfo?: DiagramTextInfoFunc;
  };
  sankey?: {
    nodeWidth?: number;
    nodeGap?: number;
    columnGap?: number | "auto";
    labelGap?: number;
    linkOpacity?: number;
    defaultNodeColor?: ColorKeyOrString;
    defaultLinkColor?: ColorKeyOrString;
    layoutMode?: "flow" | "tiered";
  };
  map?: {
    projection?: "equirectangular" | "mercator" | "naturalEarth1";
    fit?: "all-map-areas" | "only-map-areas-in-data";
    dataLabelMode?: "none" | "centroid" | "callout" | "auto";
    calloutMargin?: number;
    labelCollision?: {
      gap?: number;
      maxCentroidDisplacement?: number;
      maxIterations?: number;
    };
    outsideLabelPlacement?: "nearest" | "flank";
    labelClearanceFloor?: number;
    labelAlignmentSwitchAngle?: number;
    maxLabelLines?: number;
    insideFitFraction?: number;
    labelWrapFraction?: number;
  };

  pie?: {
    innerRadiusRatio?: number;
    startAngle?: number;
    sweepAngle?: number;
    direction?: "clockwise" | "counterclockwise";
    sliceGap?: number;
    cornerRadius?: number;
    labelMode?: "none" | "inside" | "outside" | "auto";
    calloutMargin?: number;
    centerLabel?: "none" | "total" | "share";
    indicators?: {
      hideHeaders?: boolean;
      headerAlignH?: "left" | "center" | "right";
      headerGap?: number;
      headerPosition?: "top" | "bottom";
      gapX?: number;
      gapY?: number;
      nCols?: number | "auto";
    };
    labelCollision?: {
      gap?: number;
      maxCentroidDisplacement?: number;
      maxIterations?: number;
    };
    outsideLabelPlacement?: "nearest" | "flank";
    labelClearanceFloor?: number;
    labelAlignmentSwitchAngle?: number;
    maxLabelLines?: number;
    insideFitFraction?: number;
    labelWrapFraction?: number;
    remainder?: {
      mode?: "slice" | "gap";
      fillColor?: ColorKeyOrString;
    };
  };

  // Natural-size policy for chart figures: how tall a figure wants to be,
  // absent any container constraint. Distinct from layout stretch — how far a
  // figure may grow BEYOND ideal to fill page space — which is the page/layout's
  // concern (page style content.figureMaxStretch). Resolution: custom → global
  // → default.
  idealHeight?: {
    // Value-axis charts (ChartOV, Timeseries): natural per-sub-chart
    // height (DU) as a function of vertically-stacked sub-chart rows
    // (nPaneRows × nTiers). Decays so stacked grids stay bounded. Clamped to
    // >= the legibility floor. Ignored by ChartOH and Table.
    idealSubChartHeight?: (nSubChartRows: number) => number;

    // ChartOH: natural per-bar-row thickness (DU) as a function of the figure's
    // total bar rows (nPaneRows × nTiers × nIndicators × (stacked ? 1 : nSerieses)).
    // Decays so dense category charts thin their bars instead of growing
    // without bound. Ignored by ChartOV, Timeseries, and Table.
    idealRowThickness?: (nTotalBarRows: number) => number;

    // Pie: natural DISC diameter (DU) as a function of indicators per
    // sub-chart. Both the ideal-height cap AND the draw-time maximum: a pie
    // is never drawn larger than this, whatever frame it is given — raise it
    // to let a pie fill a big tile. Ignored by every other figure.
    idealPieDiameter?: (nIndicators: number) => number;
  };
};

let _GS: CustomFigureStyleOptions | undefined = undefined;

export function setGlobalFigureStyle(gs: CustomFigureStyleOptions): void {
  assert(_GS === undefined, "Global figure styles have already been set");
  _GS = gs;
}

export function getGlobalFigureStyle(): CustomFigureStyleOptions {
  return _GS ?? {};
}
