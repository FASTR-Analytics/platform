// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AnchorPoint,
  assert,
  type CalendarType,
  type CascadeArrowInfoFunc,
  type ChartConnectorInfoFunc,
  type ChartSeriesInfoFunc,
  type ChartValueInfoFunc,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  type MapRegionInfoFunc,
  type PaddingOptions,
  type TableCellInfoFunc,
  type TableHeaderInfoFunc,
  type TickLabelFormatterOption,
  type ValuesColorFunc,
  type VizGraphEdgeInfoFunc,
} from "./deps.ts";
import type {
  ArrowheadFitFallback,
  GenericAreaStyleOptions,
  GenericBarStyleOptions,
  GenericCascadeArrowStyleOptions,
  GenericConfidenceBandStyleOptions,
  GenericConnectorStyleOptions,
  GenericDataLabelStyleOptions,
  GenericErrorBarStyleOptions,
  GenericLineStyleOptions,
  GenericMapRegionStyleOptions,
  GenericPointStyleOptions,
  GenericTableCellStyleOptions,
  GenericTableHeaderStyleOptions,
} from "./style_func_types.ts";
import type { FigureTextStyleOptions } from "./text_style_keys.ts";
import type { LegendPosition } from "./types.ts";

export type CustomFigureStyleOptions = {
  seriesColorFunc?: ChartSeriesInfoFunc<ColorKeyOrString>;
  valuesColorFunc?: ValuesColorFunc;

  ///////////////////////////////////////////
  //  ________                     __      //
  // /        |                   /  |     //
  // $$$$$$$$/______   __    __  _$$ |_    //
  //    $$ | /      \ /  \  /  |/ $$   |   //
  //    $$ |/$$$$$$  |$$  \/$$/ $$$$$$/    //
  //    $$ |$$    $$ | $$  $$<    $$ | __  //
  //    $$ |$$$$$$$$/  /$$$$  \   $$ |/  | //
  //    $$ |$$       |/$$/ $$  |  $$  $$/  //
  //    $$/  $$$$$$$/ $$/   $$/    $$$$/   //
  //                                       //
  ///////////////////////////////////////////
  text?: FigureTextStyleOptions;
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
  surrounds?: {
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString | "none";
    legendGap?: number;
    legendPosition?: LegendPosition;
    captionGap?: number;
    subCaptionTopPadding?: number;
    footnoteGap?: number;
    captionAlignH?: "left" | "center" | "right";
    subCaptionAlignH?: "left" | "center" | "right";
    footnoteAlignH?: "left" | "center" | "right";
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
  legend?: {
    legendNoRender?: boolean;
    maxLegendItemsInOneColumn?: number | number[];
    reverseOrder?: boolean;
    legendColorBoxWidth?: number;
    legendItemVerticalGap?: number;
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
  table?: {
    rowHeaderIndentIfRowGroups?: number;
    verticalColHeaders?: "never" | "always" | "auto";
    maxHeightForVerticalColHeaders?: number;
    colHeaderPadding?: PaddingOptions;
    rowHeaderPadding?: PaddingOptions;
    cellPadding?: PaddingOptions;
    alignV?: "top" | "middle" | "bottom";
    colHeaderBackgroundColor?: ColorKeyOrString | "none";
    colGroupHeaderBackgroundColor?: ColorKeyOrString | "none";
    headerBorderWidth?: number;
    gridLineWidth?: number;
    borderWidth?: number;
    headerBorderColor?: ColorKeyOrString;
    gridLineColor?: ColorKeyOrString;
    borderColor?: ColorKeyOrString;
  };
  ////////////////////////////////////////////////////////
  //  __    __          ______             __            //
  // /  |  /  |        /      \           /  |           //
  // $$ |  $$ |       /$$$$$$  | __    __ $$/   _______  //
  // $$  \/$$/        $$ |__$$ |/  \  /  |/  | /       | //
  //  $$  $$<         $$    $$ |$$  \/$$/ $$ |/$$$$$$$/  //
  //   $$$$  \        $$$$$$$$ | $$  $$<  $$ |$$      \  //
  //  $$ /$$  |       $$ |  $$ | /$$$$  \ $$ | $$$$$$  | //
  // $$ |  $$ |       $$ |  $$ |/$$/ $$  |$$ |/     $$/  //
  // $$/   $$/        $$/   $$/ $$/   $$/ $$/ $$$$$$$/   //
  //                                                     //
  ////////////////////////////////////////////////////////
  tiers?: {
    hideHeaders?: boolean;
    paddingTop?: number;
    paddingBottom?: number;
    gapY?: number;
    maxHeaderWidthAsPctOfChart?: number;
    headerAlignH?: "left" | "center" | "right";
    headerAlignV?: "top" | "middle";
    headerPosition?: "left" | "above-axis" | "above-plot-area";
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
    tickHeight?: number;
    tickLabelGap?: number;
    maxTickLabelHeightAsPctOfChart?: number;
  };
  xScaleAxis?: {
    max?: number | "auto" | ((i_pane: number) => number);
    min?: number | "auto" | ((i_pane: number) => number);
    labelGap?: number;
    tickHeight?: number;
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
  //////////////////////////////////////////////////////////
  //  __      __          ______             __            //
  // /  \    /  |        /      \           /  |           //
  // $$  \  /$$/        /$$$$$$  | __    __ $$/   _______  //
  //  $$  \/$$/         $$ |__$$ |/  \  /  |/  | /       | //
  //   $$  $$/          $$    $$ |$$  \/$$/ $$ |/$$$$$$$/  //
  //    $$$$/           $$$$$$$$ | $$  $$<  $$ |$$      \  //
  //     $$ |           $$ |  $$ | /$$$$  \ $$ | $$$$$$  | //
  //     $$ |           $$ |  $$ |/$$/ $$  |$$ |/     $$/  //
  //     $$/            $$/   $$/ $$/   $$/ $$/ $$$$$$$/   //
  //                                                       //
  //////////////////////////////////////////////////////////
  yTextAxis?: {
    tickPosition?: "sides" | "center";
    paddingTop?: number;
    paddingBottom?: number;
    labelGap?: number;
    tickWidth?: number;
    tickLabelGap?: number;
    logicTickLabelWidth?: "auto" | "fixed";
    maxTickLabelWidthAsPctOfChart?: number;
  };
  yScaleAxis?: {
    max?: number | "auto" | ((i_series: number) => number);
    min?: number | "auto" | ((i_series: number) => number);
    labelGap?: number;
    tickWidth?: number;
    tickLabelGap?: number;
    tickLabelFormatter?: TickLabelFormatterOption;
    tickLabelAlignment?: "center" | "inset";
    exactAxisX?: "none" | number;
    allowIndividualTierLimits?: boolean;
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
      };
    };
    errorBars?: {
      func?:
        | GenericErrorBarStyleOptions
        | ChartValueInfoFunc<GenericErrorBarStyleOptions>
        | "none";
    };
    confidenceBands?: {
      func?:
        | GenericConfidenceBandStyleOptions
        | ChartSeriesInfoFunc<GenericConfidenceBandStyleOptions>
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
    mapRegions?: {
      func?:
        | GenericMapRegionStyleOptions
        | MapRegionInfoFunc<GenericMapRegionStyleOptions>
        | "none";
      textFormatter?: MapRegionInfoFunc<string> | "none";
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
    };
    tableColHeaders?: {
      func?:
        | GenericTableHeaderStyleOptions
        | TableHeaderInfoFunc<GenericTableHeaderStyleOptions>
        | "none";
    };
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
  grid?: {
    showGrid?: boolean;
    axisStrokeWidth?: number;
    gridStrokeWidth?: number;
    axisColor?: ColorKeyOrString;
    gridColor?: ColorKeyOrString;
    backgroundColor?: ColorKeyOrString | "none";
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
  panes?: {
    hideHeaders?: boolean;
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString | "none";
    headerGap?: number;
    headerAlignH?: "left" | "center" | "right";
    gapX?: number;
    gapY?: number;
    nCols?: number | "auto";
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

  simpleviz?: {
    layerGap?: number;
    orderGap?: number;
    layerAlign?:
      | "left"
      | "center"
      | "right"
      | Array<"left" | "center" | "right">;
    boxes?: {
      fillColor?: ColorKeyOrString;
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      alignH?: "left" | "center" | "right";
      alignV?: "top" | "middle" | "bottom";
      textGap?: number;
      padding?: PaddingOptions;
      arrowStartPoint?: AnchorPoint;
      arrowEndPoint?: AnchorPoint;
    };
    arrows?: {
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      lineDash?: "solid" | "dashed";
      truncateStart?: number;
      truncateEnd?: number;
    };
  };

  // VizGraph (node-edge graph figures; layout config lives in the data's
  // layoutOptions — this is visual style only)
  vizgraph?: {
    nodes?: {
      fillColor?: ColorKeyOrString;
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      rectRadius?: number;
      padding?: PaddingOptions;
      maxTextWidth?: number;
      textGap?: number;
    };
    edges?: {
      strokeColor?: ColorKeyOrString;
      strokeWidth?: number;
      lineDash?: "solid" | "dashed";
      arrowheadSize?: number;
      // Per-edge overrides; precedence: per-edge data > this callback >
      // the global values above. thickness also feeds engine clearance.
      edgeInfo?: VizGraphEdgeInfoFunc;
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
    fit?: "all-regions" | "only-regions-in-data";
    boundingBox?: [number, number, number, number];
    dataLabelMode?: "none" | "centroid" | "callout" | "auto";
    calloutMargin?: number;
    labelCollision?: {
      gap?: number;
      maxCentroidDisplacement?: number;
      maxIterations?: number;
    };
  };

  // Natural-size policy for chart figures: how tall a figure wants to be,
  // absent any container constraint. Distinct from layout stretch — how far a
  // figure may grow BEYOND ideal to fill page space — which is the page/layout's
  // concern (page style content.figureMaxStretch). Resolution: custom → global
  // → default.
  idealHeight?: {
    // Scale-axis charts (ChartOV, Timeseries): natural per-subchart plot
    // height (DU) as a function of vertically-stacked subchart rows
    // (nPaneRows × nTiers). Decays so stacked grids stay bounded. Clamped to
    // >= the legibility floor. Ignored by ChartOH and Table.
    idealPlotHeight?: (nSubchartRows: number) => number;

    // ChartOH: natural per-bar-row thickness (DU) as a function of the figure's
    // total bar rows (nPaneRows × nTiers × nIndicators × (stacked ? 1 : nSeries)).
    // Decays so dense category charts thin their bars instead of growing
    // without bound. Ignored by ChartOV, Timeseries, and Table.
    idealRowThickness?: (nTotalBarRows: number) => number;
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
