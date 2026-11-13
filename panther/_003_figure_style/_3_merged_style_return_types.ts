// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AreaStyle,
  CalendarType,
  CascadeArrowInfoFunc,
  ChartConnectorInfoFunc,
  ChartSeriesInfoFunc,
  ChartValueInfoFunc,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  DiagramBadgeInfo,
  DiagramEdgeInfo,
  DiagramNodeInfo,
  DiagramTextInfo,
  LineStyle,
  MapAreaInfoFunc,
  Padding,
  PieSliceInfoFunc,
  PointStyle,
  RectStyle,
  TableCellInfoFunc,
  TableHeaderInfoFunc,
  TextInfoUnkeyed,
  TickLabelFormatterOption,
} from "./deps.ts";
import type {
  AreaDiffPair,
  ArrowheadFitFallback,
  CascadeArrowStyle,
  ConnectorStyle,
  DataLabelStyle,
  ErrorBandStyle,
  ErrorBarStyle,
  MapAreaStyle,
  PieSliceStyle,
  TableCellStyle,
  TableHeaderStyle,
} from "./style_func_types.ts";
import type { LegendPosition } from "./types.ts";

export type MergedSurroundsStyle = {
  text: {
    title: TextInfoUnkeyed;
    subtitle: TextInfoUnkeyed;
    footnote: TextInfoUnkeyed;
  };
  backgroundColor: string | "none";
  padding: Padding;
  titleGap: number;
  subtitleTopPadding: number;
  footnoteGap: number;
  legendGap: number;
  legendPosition: LegendPosition;
  titleAlignH: "left" | "center" | "right";
  subtitleAlignH: "left" | "center" | "right";
  footnoteAlignH: "left" | "center" | "right";

  // Nested style objects
  legend: MergedLegendStyle;
};

export type MergedLegendStyle = {
  text: TextInfoUnkeyed;
  seriesColorFunc: ChartSeriesInfoFunc<ColorKeyOrString>;
  maxLegendEntriesInOneColumn: number | number[];
  legendColorBoxWidth: number;
  legendEntryVerticalGap: number;
  legendLabelGap: number;
  legendPointRadius: number;
  legendPointStrokeWidth: number;
  legendPointInnerColorStrategy: ColorAdjustmentStrategy;
  legendLineStrokeWidth: number;
  reverseOrder: boolean;
  legendNoRender: boolean;
};

export type MergedScaleLegendStyle = {
  alreadyScaledValue: number;
  text: TextInfoUnkeyed;
  barHeight: number;
  tickLength: number;
  labelGap: number;
  blockGap: number;
  noDataGap: number;
  noDataSwatchWidth: number;
  minBarWidth: number;
};

export type MergedIdealHeightStyle = {
  // Natural per-sub-chart sub-chart height (DU) for value-axis charts (ChartOV,
  // Timeseries), as a function of the number of vertically-stacked sub-chart
  // rows (nPaneRows × nTiers). Decays so stacked grids stay bounded. Ignored by
  // ChartOH (category-driven) and Table (deterministic).
  idealSubChartHeight: (nSubChartRows: number) => number;
  // Natural per-bar-row thickness (DU) for ChartOH, as a function of the
  // figure's total bar rows. Decays so dense category charts thin their bars.
  // Ignored by ChartOV, Timeseries, and Table.
  idealRowThickness: (nTotalBarRows: number) => number;
  // Natural pie content diameter (DU) as a function of indicators per
  // sub-chart. A cap on the width-driven term. Ignored by every other figure.
  idealPieDiameter: (nIndicators: number) => number;
};

export type MergedChartStyleBase = {
  alreadyScaledValue: number;
  idealHeight: MergedIdealHeightStyle;
  panes: MergedPaneStyle;
  grid: MergedGridStyle;
  content: MergedContentStyle;
  lanes: {
    hideHeaders: boolean;
    paddingLeft: number;
    paddingRight: number;
    gapX: number;
    headerAlignH: "left" | "center" | "right";
    headerGap: number;
  };
  tiers: {
    hideHeaders: boolean;
    paddingTop: number;
    paddingBottom: number;
    gapY: number;
    maxHeaderWidthFractionOfPane: number;
    headerAlignH: "left" | "center" | "right";
    headerAlignV: "top" | "middle";
    headerPosition:
      | "left"
      | "above-axis"
      | "above-sub-chart"
      | "above-axis-if-no-lanes"
      | "above-sub-chart-if-no-lanes";
    headerGap: number;
  };
  text: {
    paneHeaders: TextInfoUnkeyed;
    laneHeaders: TextInfoUnkeyed;
    tierHeaders: TextInfoUnkeyed;
    dataLabels: TextInfoUnkeyed;
  };
};

export type MapDataLabelMode = "none" | "centroid" | "callout" | "auto";

// Collision policy for the shared figure-label solver (map areas, pie
// slices). Figure-wide, not per-element, so it lives on each figure's
// structural style block (map.labelCollision, pie.labelCollision) rather than
// on the content layer. `maxCentroidDisplacement` keeps its authored name: the
// solvers were renamed centroid/callout → inside/outside, but the style key is
// a consumer-facing surface.
export type LabelCollisionConfig = {
  gap: number;
  maxCentroidDisplacement: number;
  maxIterations: number;
};

export type MergedMapStyle = MergedChartStyleBase & {
  map: {
    projection: "equirectangular" | "mercator" | "naturalEarth1";
    fit: "all-map-areas" | "only-map-areas-in-data";
    dataLabelMode: MapDataLabelMode;
    calloutMargin: number;
    labelCollision: LabelCollisionConfig;
    outsideLabelPlacement: OutsideLabelPlacement;
    labelClearanceFloor: number;
    labelAlignmentSwitchAngle: number;
    maxLabelLines: number;
    insideFitFraction: number;
    labelWrapFraction: number;
  };
};

// Pie's label placement names a REGION ("inside"/"outside"), where map's names
// an ANCHOR RULE ("centroid"/"callout"). Deliberately separate style enums;
// both resolve to the shared LabelPlacement at measure time.
export type PieLabelMode = "none" | "inside" | "outside" | "auto";

// Which placer runs for labels that go outside. One type for both charts with
// no axes — the policy is the same choice, and the placers are shared.
export type OutsideLabelPlacement = "nearest" | "flank";

export type MergedPieStyle = MergedChartStyleBase & {
  pie: {
    innerRadiusRatio: number;
    startAngle: number;
    sweepAngle: number;
    direction: "clockwise" | "counterclockwise";
    sliceGap: number;
    cornerRadius: number;
    labelMode: PieLabelMode;
    calloutMargin: number;
    centerLabel: "none" | "total" | "share";
    // Indicator headers are pie-only, so their text style lives here as a
    // block-local sub-object (like the axis blocks') rather than on
    // MergedChartStyleBase["text"], which every chart shares.
    text: {
      indicatorHeaders: TextInfoUnkeyed;
    };
    indicators: {
      hideHeaders: boolean;
      headerAlignH: "left" | "center" | "right";
      headerGap: number;
      headerPosition: "top" | "bottom";
      gapX: number;
      gapY: number;
      nCols: number | "auto";
    };
    labelCollision: LabelCollisionConfig;
    outsideLabelPlacement: OutsideLabelPlacement;
    labelClearanceFloor: number;
    labelAlignmentSwitchAngle: number;
    maxLabelLines: number;
    insideFitFraction: number;
    labelWrapFraction: number;
    remainder: {
      mode: "slice" | "gap";
      fillColor: ColorKeyOrString;
    };
  };
};

export type MergedChartOVStyle = MergedChartStyleBase & {
  yValueAxis: MergedYValueAxisStyle;
  xTextAxis: MergedXTextAxisStyle;
};

export type MergedChartOHStyle = MergedChartStyleBase & {
  xValueAxis: MergedXValueAxisStyle;
  yTextAxis: MergedYTextAxisStyle;
};

export type MergedCascadeArrowStyle = {
  text: {
    labels: TextInfoUnkeyed;
  };
  getStyle: CascadeArrowInfoFunc<CascadeArrowStyle>;
  textFormatter: CascadeArrowInfoFunc<string> | "none";
};

export type MergedYTextAxisStyle = {
  text: {
    yTextAxisTickLabels: TextInfoUnkeyed;
  };
  tickLength: number;
  tickLabelGap: number;
  tickPosition: "sides" | "center";
  paddingTop: number;
  paddingBottom: number;
  maxTickLabelWidthFractionOfPane: number;
};

export type MergedXValueAxisStyle = {
  text: {
    xValueAxisTickLabels: TextInfoUnkeyed;
    xValueAxisLabel: TextInfoUnkeyed;
  };
  max: number | "auto" | "auto-zero" | ((i_pane: number) => number);
  min: number | "auto" | "auto-zero" | ((i_pane: number) => number);
  axisLabelGap: number;
  tickLength: number;
  tickLabelGap: number;
  tickLabelFormatter: TickLabelFormatterOption;
  tickLabelAlignment: "center" | "inset";
  allowIndividualLaneLimits: boolean;
  exactAxisY: "none" | number;
};

export type MergedTimeseriesStyle = MergedChartStyleBase & {
  yValueAxis: MergedYValueAxisStyle;
  xPeriodAxis: MergedXPeriodAxisStyle;
};

export type MergedTableStyle = {
  alreadyScaledValue: number;
  text: {
    colHeaders: TextInfoUnkeyed;
    colGroupHeaders: TextInfoUnkeyed;
    rowHeaders: TextInfoUnkeyed;
    rowGroupHeaders: TextInfoUnkeyed;
    cells: TextInfoUnkeyed;
  };
  rowHeaderIndentIfRowGroups: number;
  verticalColHeaders: "never" | "always" | "auto";
  maxHeightForVerticalColHeaders: number;
  tableCells: {
    getStyle: TableCellInfoFunc<TableCellStyle>;
    textFormatter: TableCellInfoFunc<string> | "none";
  };
  tableRowHeaders: {
    getStyle: TableHeaderInfoFunc<TableHeaderStyle>;
    textFormatter: TableHeaderInfoFunc<string> | "none";
  };
  tableColHeaders: {
    getStyle: TableHeaderInfoFunc<TableHeaderStyle>;
    textFormatter: TableHeaderInfoFunc<string> | "none";
  };
  colHeaderPadding: Padding;
  rowHeaderPadding: Padding;
  cellPadding: Padding;
  headerBorderWidth: number;
  gridLineWidth: number;
  borderWidth: number;
  headerBorderColor: string;
  gridLineColor: string;
  borderColor: string;
};

export type MergedGridStyle = {
  showGridLines: boolean;
  axisStrokeWidth: number;
  gridLineStrokeWidth: number;
  axisColor: string;
  gridLineColor: string;
  backgroundColor: string | "none";
};

export type MergedPaneStyle = {
  hideHeaders: boolean;
  nCols: number | "auto";
  minWidth: number;
  gapX: number;
  gapY: number;
  padding: Padding;
  backgroundColor: string | "none";
  headerGap: number;
  headerAlignH: "left" | "center" | "right";
};

export type MergedContentStyle = {
  points: {
    getStyle: ChartValueInfoFunc<
      PointStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
    >;
    textFormatter: ChartValueInfoFunc<string> | "none";
  };
  bars: {
    getStyle: ChartValueInfoFunc<
      RectStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
    >;
    textFormatter: ChartValueInfoFunc<string> | "none";
    stacking:
      | "none"
      | "stacked"
      | "imposed"
      | "diff";
    maxBarWidth: number;
  };
  lines: {
    getStyle: ChartSeriesInfoFunc<
      LineStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
    >;
    textFormatter: ChartValueInfoFunc<string> | "none";
    joinAcrossGaps: boolean;
  };
  areas: {
    getStyle: ChartSeriesInfoFunc<
      AreaStyle & { annotationGroup?: string }
    >;
    joinAcrossGaps: boolean;
    diff: {
      enabled: boolean;
      pairs: AreaDiffPair[];
    };
  };
  errorBars: MergedErrorBarStyle;
  errorBands: MergedErrorBandStyle;
  cascadeArrows: MergedCascadeArrowStyle;
  connectors: MergedConnectorStyle;
  mapAreas: {
    getStyle: MapAreaInfoFunc<MapAreaStyle>;
    textFormatter: MapAreaInfoFunc<string> | "none";
  };
  slices: {
    getStyle: PieSliceInfoFunc<PieSliceStyle>;
    textFormatter: PieSliceInfoFunc<string> | "none";
  };
};

export type MergedErrorBarStyle = {
  getStyle: ChartValueInfoFunc<ErrorBarStyle>;
};

export type MergedErrorBandStyle = {
  getStyle: ChartSeriesInfoFunc<ErrorBandStyle>;
};

export type MergedConnectorStyle = {
  getStyle: ChartConnectorInfoFunc<ConnectorStyle>;
  joinAcrossGaps: boolean;
  arrowheadFitFallback: ArrowheadFitFallback;
};

export type MergedYValueAxisStyle = {
  text: {
    yValueAxisTickLabels: TextInfoUnkeyed;
    yValueAxisLabel: TextInfoUnkeyed;
  };
  max: number | "auto" | "auto-zero" | ((i_pane: number) => number);
  min: number | "auto" | "auto-zero" | ((i_pane: number) => number);
  axisLabelGap: number;
  tickLength: number;
  tickLabelGap: number;
  tickLabelFormatter: TickLabelFormatterOption;
  tickLabelAlignment: "center" | "inset";
  allowIndividualTierLimits: boolean;
  exactAxisX: "none" | number;
};

export type MergedXTextAxisStyle = {
  text: {
    xTextAxisTickLabels: TextInfoUnkeyed;
  };
  verticalTickLabels: boolean;
  tickLength: number;
  tickPosition: "sides" | "center";
  tickLabelGap: number;
  maxTickLabelHeightFractionOfPane: number;
};

export type MergedXPeriodAxisStyle = {
  text: {
    xPeriodAxisTickLabels: TextInfoUnkeyed;
  };
  forceSideTicksWhenYear: boolean;
  showEveryNthTick: number;
  periodLabelSmallTopPadding: number;
  periodLabelLargeTopPadding: number;
  calendar: CalendarType;
};

export type MergedSceneRegionChrome = {
  fillColor: string;
  strokeColor: string;
  strokeWidth: number;
  rectRadius: number;
};

export type MergedSceneStyle = {
  alreadyScaledValue: number;
  text: {
    boxTitle: TextInfoUnkeyed;
    boxSub: TextInfoUnkeyed;
    boxLine: TextInfoUnkeyed;
    badge: TextInfoUnkeyed;
    regionLabel: TextInfoUnkeyed;
    connectorLabel: TextInfoUnkeyed;
    text: TextInfoUnkeyed;
  };
  boxes: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    rectRadius: number;
    padding: Padding;
    textGap: number;
    gap: number;
    alignH: "left" | "center" | "right";
  };
  badges: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    padding: Padding;
    gap: number;
  };
  connectors: {
    strokeColor: string;
    strokeWidth: number;
    lineDash: "solid" | "dashed";
    headSize: number;
    gap: number;
    cornerRadius: number;
    labelFillColor: string;
    labelPadding: Padding;
  };
  regions: {
    labelInset: number;
    rect: MergedSceneRegionChrome;
    panel: MergedSceneRegionChrome;
    band: MergedSceneRegionChrome;
    bracket: {
      strokeColor: string;
      strokeWidth: number;
      depth: number;
    };
    ring: MergedSceneRegionChrome;
  };
  // The diagram block, merged here because a diagram is a producer of
  // scenes and the builder lays diagrams out too.
  diagram: {
    maxNodeTextWidth: number;
    groupPad: number;
    nodeInfo: (info: DiagramNodeInfo) => {
      fillColor?: string;
      strokeColor?: string;
      strokeWidth?: number;
      rectRadius?: number;
      textColor?: string;
      opacity?: number;
    };
    badgeInfo: (info: DiagramBadgeInfo) => {
      fillColor?: string;
      strokeColor?: string;
      textColor?: string;
      opacity?: number;
    };
    edgeInfo: (info: DiagramEdgeInfo) => {
      thickness?: number;
      strokeColor?: string;
      lineDash?: "solid" | "dashed";
      opacity?: number;
    };
    textInfo: (info: DiagramTextInfo) => {
      textColor?: string;
      opacity?: number;
    };
  };
};

export type SankeyLayoutMode = "flow" | "tiered";

export type MergedSankeyStyle = {
  alreadyScaledValue: number;
  nodeWidth: number;
  nodeGap: number;
  columnGap: number | "auto";
  labelGap: number;
  linkOpacity: number;
  defaultNodeColor: string;
  defaultLinkColor: string;
  layoutMode: SankeyLayoutMode;
};
