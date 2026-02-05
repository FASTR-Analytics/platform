// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AnchorPoint,
  AreaStyle,
  CalendarType,
  ChartSeriesInfoFunc,
  ChartValueInfoFunc,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  LineStyle,
  Padding,
  PointStyle,
  RectStyle,
  TextInfo,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { TableCellFormatterFunc } from "./style_func_types.ts";
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

export type MergedChartOVStyle = {
  alreadyScaledValue: number;
  text: {
    paneHeaders: TextInfoUnkeyed;
    laneHeaders: TextInfoUnkeyed;
    dataLabels: TextInfoUnkeyed;
  };
  chartAreaBackgroundColor: string | "none";
  hideColHeaders: boolean;

  // Nested style objects
  content: MergedContentStyle;
  yScaleAxis: MergedYScaleAxisStyle;
  xTextAxis: MergedXTextAxisStyle;
  grid: MergedGridStyle;
  panes: MergedPaneStyle;
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

export type MergedTimeseriesStyle = {
  alreadyScaledValue: number;
  text: {
    base: TextInfoUnkeyed;
    laneHeaders: TextInfoUnkeyed;
    dataLabels: TextInfoUnkeyed;
    paneHeaders: TextInfoUnkeyed;
  };
  chartAreaBackgroundColor: string | "none";
  hideColHeaders: boolean;

  // Nested style objects
  content: MergedContentStyle;
  yScaleAxis: MergedYScaleAxisStyle;
  xPeriodAxis: MergedXPeriodAxisStyle;
  grid: MergedGridStyle;
  panes: MergedPaneStyle;
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
  cellValueFormatter: TableCellFormatterFunc<
    string | number | null | undefined,
    string
  >;
  cellBackgroundColorFormatter:
    | "none"
    | TableCellFormatterFunc<
        string | number | null | undefined,
        ColorKeyOrString
      >;
  colHeaderPadding: Padding;
  rowHeaderPadding: Padding;
  cellPadding: Padding;
  cellVerticalAlign: "top" | "middle" | "bottom";
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
  nCols: number | "auto";
  gapX: number;
  gapY: number;
  padding: Padding;
  backgroundColor: string | "none";
  headerGap: number;
  headerAlignment: "left" | "center" | "right";
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
    getStyle: ChartValueInfoFunc<PointStyle>;
  };
  bars: {
    getStyle: ChartValueInfoFunc<RectStyle>;
    stacking: "none" | "stacked" | "imposed" | "uncertainty" | "uncertainty-tiers";
    maxBarWidth: number;
  };
  lines: {
    getStyle: ChartSeriesInfoFunc<LineStyle>;
    joinAcrossGaps: boolean;
  };
  areas: {
    getStyle: ChartSeriesInfoFunc<AreaStyle>;
    diff: {
      enabled: boolean;
      // order: "actual-expected" | "expected-actual";
    };
  };
  withDataLabels: boolean;
  dataLabelFormatter: ChartValueInfoFunc<string | undefined>;
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
    tierHeaders: TextInfoUnkeyed;
  };
  max: number | "auto" | ((i_series: number) => number);
  min: number | "auto" | ((i_series: number) => number);
  labelGap: number;
  tickWidth: number;
  tickLabelGap: number;
  tickLabelFormatter: (v: number) => string;
  forceTopOverhangHeight: "none" | number;
  allowIndividualTierLimits: boolean;
  exactAxisX: "none" | number;
  tierPaddingTop: number;
  tierPaddingBottom: number;
  tierGapY: number;
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
  lanePaddingLeft: number;
  lanePaddingRight: number;
  laneGapX: number;
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
  lanePaddingLeft: number;
  lanePaddingRight: number;
  laneGapX: number;
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
    textHorizontalAlign: "left" | "center" | "right";
    textVerticalAlign: "top" | "center" | "bottom";
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
