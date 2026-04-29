// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnchorPoint,
  AreaStyle,
  CalendarType,
  CascadeArrowInfoFunc,
  ChartSeriesInfoFunc,
  ChartValueInfoFunc,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  LineStyle,
  MapRegionInfoFunc,
  Padding,
  PointStyle,
  RectStyle,
  TableCellInfoFunc,
  TextInfo,
  TextInfoUnkeyed,
  TickLabelFormatterOption,
} from "./deps.ts";
import type {
  CascadeArrowStyle,
  ConfidenceBandStyle,
  DataLabelStyle,
  ErrorBarStyle,
  MapRegionStyle,
  TableCellStyle,
} from "./style_func_types.ts";
import type { LegendPosition } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////////////////////
//   ______                                                                     __            //
//  /      \                                                                   /  |           //
// /$$$$$$  | __    __   ______    ______    ______   __    __  _______    ____$$ |  _______  //
// $$ \__$$/ /  |  /  | /      \  /      \  /      \ /  |  /  |/       \  /    $$ | /       | //
// $$      \ $$ |  $$ |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |  $$ |$$$$$$$  |/$$$$$$$ |/$$$$$$$/  //
//  $$$$$$  |$$ |  $$ |$$ |  $$/ $$ |  $$/ $$ |  $$ |$$ |  $$ |$$ |  $$ |$$ |  $$ |$$      \  //
// /  \__$$ |$$ \__$$ |$$ |      $$ |      $$ \__$$ |$$ \__$$ |$$ |  $$ |$$ \__$$ | $$$$$$  | //
// $$    $$/ $$    $$/ $$ |      $$ |      $$    $$/ $$    $$/ $$ |  $$ |$$    $$ |/     $$/  //
//  $$$$$$/   $$$$$$/  $$/       $$/        $$$$$$/   $$$$$$/  $$/   $$/  $$$$$$$/ $$$$$$$/   //
//                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////

export type MergedSurroundsStyle = {
  text: {
    caption: TextInfoUnkeyed;
    subCaption: TextInfoUnkeyed;
    footnote: TextInfoUnkeyed;
  };
  backgroundColor: string | "none";
  padding: Padding;
  captionGap: number;
  subCaptionTopPadding: number;
  footnoteGap: number;
  legendGap: number;
  legendPosition: LegendPosition;
  captionAlignH: "left" | "center" | "right";
  subCaptionAlignH: "left" | "center" | "right";
  footnoteAlignH: "left" | "center" | "right";

  // Nested style objects
  legend: MergedLegendStyle;
};

//////////////////////////////////////////////////////////////////
//  __                                                      __  //
// /  |                                                    /  | //
// $$ |        ______    ______    ______   _______    ____$$ | //
// $$ |       /      \  /      \  /      \ /       \  /    $$ | //
// $$ |      /$$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$$  |/$$$$$$$ | //
// $$ |      $$    $$ |$$ |  $$ |$$    $$ |$$ |  $$ |$$ |  $$ | //
// $$ |_____ $$$$$$$$/ $$ \__$$ |$$$$$$$$/ $$ |  $$ |$$ \__$$ | //
// $$       |$$       |$$    $$ |$$       |$$ |  $$ |$$    $$ | //
// $$$$$$$$/  $$$$$$$/  $$$$$$$ | $$$$$$$/ $$/   $$/  $$$$$$$/  //
//                     /  \__$$ |                               //
//                     $$    $$/                                //
//                      $$$$$$/                                 //
//                                                              //
//////////////////////////////////////////////////////////////////

export type MergedLegendStyle = {
  text: TextInfoUnkeyed;
  seriesColorFunc: ChartSeriesInfoFunc<ColorKeyOrString>;
  maxLegendItemsInOneColumn: number | number[];
  legendColorBoxWidth: number;
  legendItemVerticalGap: number;
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
};

/////////////////////////////////////////////////////////////////////////////
//   ______   __                              __       ______   __     __  //
//  /      \ /  |                            /  |     /      \ /  |   /  | //
// /$$$$$$  |$$ |____    ______    ______   _$$ |_   /$$$$$$  |$$ |   $$ | //
// $$ |  $$/ $$      \  /      \  /      \ / $$   |  $$ |  $$ |$$ |   $$ | //
// $$ |      $$$$$$$  | $$$$$$  |/$$$$$$  |$$$$$$/   $$ |  $$ |$$  \ /$$/  //
// $$ |   __ $$ |  $$ | /    $$ |$$ |  $$/   $$ | __ $$ |  $$ | $$  /$$/   //
// $$ \__/  |$$ |  $$ |/$$$$$$$ |$$ |        $$ |/  |$$ \__$$ |  $$ $$/    //
// $$    $$/ $$ |  $$ |$$    $$ |$$ |        $$  $$/ $$    $$/    $$$/     //
//  $$$$$$/  $$/   $$/  $$$$$$$/ $$/          $$$$/   $$$$$$/      $/      //
//                                                                         //
/////////////////////////////////////////////////////////////////////////////

export type MergedChartStyleBase = {
  alreadyScaledValue: number;
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
    maxHeaderWidthAsPctOfChart: number;
    headerAlignH: "left" | "center" | "right";
    headerAlignV: "top" | "middle";
    headerPosition: "left" | "above-axis" | "above-plot-area";
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

export type MapLabelPositioning = "legacy" | "v2";

export type MapLabelCollisionConfig = {
  gap: number;
  maxCentroidDisplacement: number;
  maxIterations: number;
};

export type MergedMapStyle = MergedChartStyleBase & {
  map: {
    projection: "equirectangular" | "mercator" | "naturalEarth1";
    fit: "all-regions" | "only-regions-in-data";
    boundingBox?: [number, number, number, number];
    dataLabelMode: MapDataLabelMode;
    calloutMargin: number;
    labelPositioning: MapLabelPositioning;
    labelCollision: MapLabelCollisionConfig;
  };
};

export type MergedChartOVStyle = MergedChartStyleBase & {
  yScaleAxis: MergedYScaleAxisStyle;
  xTextAxis: MergedXTextAxisStyle;
};

export type MergedChartOHStyle = MergedChartStyleBase & {
  xScaleAxis: MergedXScaleAxisStyle;
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
    yTextAxisLabel: TextInfoUnkeyed;
  };
  tickWidth: number;
  tickLabelGap: number;
  labelGap: number;
  tickPosition: "sides" | "center";
  // Scaffold for future col-group support; ignored in v1 measurement/primitives.
  colHeight: number;
  paddingTop: number;
  paddingBottom: number;
  logicTickLabelWidth: "auto" | "fixed";
  maxTickLabelWidthAsPctOfChart: number;
};

export type MergedXScaleAxisStyle = {
  text: {
    xScaleAxisTickLabels: TextInfoUnkeyed;
    xScaleAxisLabel: TextInfoUnkeyed;
  };
  max: number | "auto" | ((i_pane: number) => number);
  min: number | "auto" | ((i_pane: number) => number);
  labelGap: number;
  tickHeight: number;
  tickLabelGap: number;
  tickLabelFormatter: TickLabelFormatterOption;
  forceRightOverhangWidth: "none" | number;
  allowIndividualLaneLimits: boolean;
  exactAxisY: "none" | number;
};

//////////////////////////////////////////////////////////////////////////////////////////////////
//  ________  __                                                        __                      //
// /        |/  |                                                      /  |                     //
// $$$$$$$$/ $$/  _____  ____    ______    _______   ______    ______  $$/   ______    _______  //
//    $$ |   /  |/     \/    \  /      \  /       | /      \  /      \ /  | /      \  /       | //
//    $$ |   $$ |$$$$$$ $$$$  |/$$$$$$  |/$$$$$$$/ /$$$$$$  |/$$$$$$  |$$ |/$$$$$$  |/$$$$$$$/  //
//    $$ |   $$ |$$ | $$ | $$ |$$    $$ |$$      \ $$    $$ |$$ |  $$/ $$ |$$    $$ |$$      \  //
//    $$ |   $$ |$$ | $$ | $$ |$$$$$$$$/  $$$$$$  |$$$$$$$$/ $$ |      $$ |$$$$$$$$/  $$$$$$  | //
//    $$ |   $$ |$$ | $$ | $$ |$$       |/     $$/ $$       |$$ |      $$ |$$       |/     $$/  //
//    $$/    $$/ $$/  $$/  $$/  $$$$$$$/ $$$$$$$/   $$$$$$$/ $$/       $$/  $$$$$$$/ $$$$$$$/   //
//                                                                                              //
//////////////////////////////////////////////////////////////////////////////////////////////////

export type MergedTimeseriesStyle = MergedChartStyleBase & {
  yScaleAxis: MergedYScaleAxisStyle;
  xPeriodAxis: MergedXPeriodAxisStyle;
};

///////////////////////////////////////////////
//  ________         __        __            //
// /        |       /  |      /  |           //
// $$$$$$$$/______  $$ |____  $$ |  ______   //
//    $$ | /      \ $$      \ $$ | /      \  //
//    $$ | $$$$$$  |$$$$$$$  |$$ |/$$$$$$  | //
//    $$ | /    $$ |$$ |  $$ |$$ |$$    $$ | //
//    $$ |/$$$$$$$ |$$ |__$$ |$$ |$$$$$$$$/  //
//    $$ |$$    $$ |$$    $$/ $$ |$$       | //
//    $$/  $$$$$$$/ $$$$$$$/  $$/  $$$$$$$/  //
//                                           //
///////////////////////////////////////////////

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
  colHeaderPadding: Padding;
  rowHeaderPadding: Padding;
  cellPadding: Padding;
  alignV: "top" | "middle" | "bottom";
  colHeaderBackgroundColor: string | "none";
  colGroupHeaderBackgroundColor: string | "none";
  headerBorderWidth: number;
  gridLineWidth: number;
  borderWidth: number;
  headerBorderColor: string;
  gridLineColor: string;
  borderColor: string;
};

////////////////////////////////////////
//   ______             __        __  //
//  /      \           /  |      /  | //
// /$$$$$$  |  ______  $$/   ____$$ | //
// $$ | _$$/  /      \ /  | /    $$ | //
// $$ |/    |/$$$$$$  |$$ |/$$$$$$$ | //
// $$ |$$$$ |$$ |  $$/ $$ |$$ |  $$ | //
// $$ \__$$ |$$ |      $$ |$$ \__$$ | //
// $$    $$/ $$ |      $$ |$$    $$ | //
//  $$$$$$/  $$/       $$/  $$$$$$$/  //
//                                    //
////////////////////////////////////////

export type MergedGridStyle = {
  showGrid: boolean;
  axisStrokeWidth: number;
  gridStrokeWidth: number;
  axisColor: string;
  gridColor: string;
  backgroundColor: string | "none";
};

///////////////////////////////////////////////////////
//  _______                                          //
// /       \                                         //
// $$$$$$$  | ______   _______    ______    _______  //
// $$ |__$$ |/      \ /       \  /      \  /       | //
// $$    $$/ $$$$$$  |$$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$/  /    $$ |$$ |  $$ |$$    $$ |$$      \  //
// $$ |     /$$$$$$$ |$$ |  $$ |$$$$$$$$/  $$$$$$  | //
// $$ |     $$    $$ |$$ |  $$ |$$       |/     $$/  //
// $$/       $$$$$$$/ $$/   $$/  $$$$$$$/ $$$$$$$/   //
//                                                   //
///////////////////////////////////////////////////////

export type MergedPaneStyle = {
  hideHeaders: boolean;
  nCols: number | "auto";
  gapX: number;
  gapY: number;
  padding: Padding;
  backgroundColor: string | "none";
  headerGap: number;
  headerAlignH: "left" | "center" | "right";
};

////////////////////////////////////////////////////////////////////////////
//   ______                         __                            __      //
//  /      \                       /  |                          /  |     //
// /$$$$$$  |  ______   _______   _$$ |_     ______   _______   _$$ |_    //
// $$ |  $$/  /      \ /       \ / $$   |   /      \ /       \ / $$   |   //
// $$ |      /$$$$$$  |$$$$$$$  |$$$$$$/   /$$$$$$  |$$$$$$$  |$$$$$$/    //
// $$ |   __ $$ |  $$ |$$ |  $$ |  $$ | __ $$    $$ |$$ |  $$ |  $$ | __  //
// $$ \__/  |$$ \__$$ |$$ |  $$ |  $$ |/  |$$$$$$$$/ $$ |  $$ |  $$ |/  | //
// $$    $$/ $$    $$/ $$ |  $$ |  $$  $$/ $$       |$$ |  $$ |  $$  $$/  //
//  $$$$$$/   $$$$$$/  $$/   $$/    $$$$/   $$$$$$$/ $$/   $$/    $$$$/   //
//                                                                        //
////////////////////////////////////////////////////////////////////////////

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
    };
  };
  errorBars: MergedErrorBarStyle;
  confidenceBands: MergedConfidenceBandStyle;
  cascadeArrows: MergedCascadeArrowStyle;
  mapRegions: {
    getStyle: MapRegionInfoFunc<MapRegionStyle>;
    textFormatter: MapRegionInfoFunc<string> | "none";
  };
};

export type MergedErrorBarStyle = {
  getStyle: ChartValueInfoFunc<ErrorBarStyle>;
};

export type MergedConfidenceBandStyle = {
  getStyle: ChartSeriesInfoFunc<ConfidenceBandStyle>;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __      __                                      __                                      __            //
// /  \    /  |                                    /  |                                    /  |           //
// $$  \  /$$/         _______   _______   ______  $$ |  ______          ______   __    __ $$/   _______  //
//  $$  \/$$/         /       | /       | /      \ $$ | /      \        /      \ /  \  /  |/  | /       | //
//   $$  $$/         /$$$$$$$/ /$$$$$$$/  $$$$$$  |$$ |/$$$$$$  |       $$$$$$  |$$  \/$$/ $$ |/$$$$$$$/  //
//    $$$$/          $$      \ $$ |       /    $$ |$$ |$$    $$ |       /    $$ | $$  $$<  $$ |$$      \  //
//     $$ |           $$$$$$  |$$ \_____ /$$$$$$$ |$$ |$$$$$$$$/       /$$$$$$$ | /$$$$  \ $$ | $$$$$$  | //
//     $$ |          /     $$/ $$       |$$    $$ |$$ |$$       |      $$    $$ |/$$/ $$  |$$ |/     $$/  //
//     $$/           $$$$$$$/   $$$$$$$/  $$$$$$$/ $$/  $$$$$$$/        $$$$$$$/ $$/   $$/ $$/ $$$$$$$/   //
//                                                                                                        //
////////////////////////////////////////////////////////////////////////////////////////////////////////////

export type MergedYScaleAxisStyle = {
  text: {
    yScaleAxisTickLabels: TextInfoUnkeyed;
    yScaleAxisLabel: TextInfoUnkeyed;
  };
  max: number | "auto" | ((i_series: number) => number);
  min: number | "auto" | ((i_series: number) => number);
  labelGap: number;
  tickWidth: number;
  tickLabelGap: number;
  tickLabelFormatter: TickLabelFormatterOption;
  forceTopOverhangHeight: "none" | number;
  allowIndividualTierLimits: boolean;
  exactAxisX: "none" | number;
};

//////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __          __                            __                                __            //
// /  |  /  |        /  |                          /  |                              /  |           //
// $$ |  $$ |       _$$ |_     ______   __    __  _$$ |_           ______   __    __ $$/   _______  //
// $$  \/$$/       / $$   |   /      \ /  \  /  |/ $$   |         /      \ /  \  /  |/  | /       | //
//  $$  $$<        $$$$$$/   /$$$$$$  |$$  \/$$/ $$$$$$/          $$$$$$  |$$  \/$$/ $$ |/$$$$$$$/  //
//   $$$$  \         $$ | __ $$    $$ | $$  $$<    $$ | __        /    $$ | $$  $$<  $$ |$$      \  //
//  $$ /$$  |        $$ |/  |$$$$$$$$/  /$$$$  \   $$ |/  |      /$$$$$$$ | /$$$$  \ $$ | $$$$$$  | //
// $$ |  $$ |        $$  $$/ $$       |/$$/ $$  |  $$  $$/       $$    $$ |/$$/ $$  |$$ |/     $$/  //
// $$/   $$/          $$$$/   $$$$$$$/ $$/   $$/    $$$$/         $$$$$$$/ $$/   $$/ $$/ $$$$$$$/   //
//                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////

export type MergedXTextAxisStyle = {
  text: {
    xTextAxisTickLabels: TextInfoUnkeyed;
  };
  verticalTickLabels: boolean;
  tickHeight: number;
  tickPosition: "sides" | "center";
  tickLabelGap: number;
};

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __                                      __                  __                            __            //
// /  |  /  |                                    /  |                /  |                          /  |           //
// $$ |  $$ |        ______    ______    ______  $$/   ______    ____$$ |        ______   __    __ $$/   _______  //
// $$  \/$$/        /      \  /      \  /      \ /  | /      \  /    $$ |       /      \ /  \  /  |/  | /       | //
//  $$  $$<        /$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |/$$$$$$  |/$$$$$$$ |       $$$$$$  |$$  \/$$/ $$ |/$$$$$$$/  //
//   $$$$  \       $$ |  $$ |$$    $$ |$$ |  $$/ $$ |$$ |  $$ |$$ |  $$ |       /    $$ | $$  $$<  $$ |$$      \  //
//  $$ /$$  |      $$ |__$$ |$$$$$$$$/ $$ |      $$ |$$ \__$$ |$$ \__$$ |      /$$$$$$$ | /$$$$  \ $$ | $$$$$$  | //
// $$ |  $$ |      $$    $$/ $$       |$$ |      $$ |$$    $$/ $$    $$ |      $$    $$ |/$$/ $$  |$$ |/     $$/  //
// $$/   $$/       $$$$$$$/   $$$$$$$/ $$/       $$/  $$$$$$/   $$$$$$$/        $$$$$$$/ $$/   $$/ $$/ $$$$$$$/   //
//                 $$ |                                                                                           //
//                 $$ |                                                                                           //
//                 $$/                                                                                            //
//                                                                                                                //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

/////////////////////////////////////////////////////////////////////////////
//   ______   __                            __           __   __           //
//  /      \ /  |                          /  |         /  | /  |          //
// /$$$$$$  |$$/  _____  ____    ______   $$ |  ______  $$ |$$/  ________ //
// $$ \__$$/ /  |/     \/    \  /      \  $$ | /      \ $$ |/  |/        |//
// $$      \ $$ |$$$$$$ $$$$  |/$$$$$$  | $$ |/$$$$$$  |$$ |$$ |$$$$$$$$/ //
//  $$$$$$  |$$ |$$ | $$ | $$ |$$ |  $$ | $$ |$$    $$ |$$ |$$ |    /  $/ //
// /  \__$$ |$$ |$$ | $$ | $$ |$$ |__$$ | $$ |$$$$$$$$/ $$ |$$ |   /$$$/__//
// $$    $$/ $$ |$$ | $$ | $$ |$$    $$/  $$ |$$       |$$ |$$ |  /$$    |//
//  $$$$$$/  $$/ $$/  $$/  $$/ $$$$$$$/   $$/  $$$$$$$/ $$/ $$/   $$$$$$/ //
//                             $$ |                                        //
//                             $$ |                                        //
//                             $$/                                         //
/////////////////////////////////////////////////////////////////////////////

export type MergedSimpleVizStyle = {
  alreadyScaledValue: number;
  layerGap: number; // Vertical spacing between layers (default: 150)
  orderGap: number; // Horizontal spacing between boxes in same layer (default: 100)
  layerAlign: "left" | "center" | "right" | Array<"left" | "center" | "right">; // Alignment of boxes within each layer
  text: {
    primary: TextInfoUnkeyed;
    secondary: TextInfoUnkeyed;
    base: TextInfo; // Unscaled base for per-box text style overrides
  };
  boxes: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: number;
    alignH: "left" | "center" | "right";
    alignV: "top" | "middle" | "bottom";
    textGap: number;
    padding: Padding;
    arrowStartPoint: AnchorPoint;
    arrowEndPoint: AnchorPoint;
  };
  arrows: {
    strokeColor: string;
    strokeWidth: number;
    lineDash: "solid" | "dashed";
    truncateStart: number;
    truncateEnd: number;
  };
};

/////////////////////////////////////////////////////////////////////////////
//   ______                    __                                          //
//  /      \                  /  |                                         //
// /$$$$$$  |  ______   ____  $$ |   __   ______   __    __                //
// $$ \__$$/  /      \ /    \ $$ |  /  | /      \ /  |  /  |               //
// $$      \ /$$$$$$  |$$$$$  $$ |_/$$/  /$$$$$$  |$$ |  $$ |               //
//  $$$$$$  |$$ |  $$ |$$ | $$$$ $$<     $$    $$ |$$ |  $$ |               //
// /  \__$$ |$$ \__$$ |$$ | $$$$ |$$  \  $$$$$$$$/ $$ \__$$ |               //
// $$    $$/ $$    $$/ $$ | $$ $$/   $$  $$       |$$    $$ |               //
//  $$$$$$/   $$$$$$/  $$/  $$/  $$$$$$/  $$$$$$$/  $$$$$$$ |               //
//                                                 /  \__$$ |               //
//                                                 $$    $$/                //
//                                                  $$$$$$/                 //
/////////////////////////////////////////////////////////////////////////////

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
