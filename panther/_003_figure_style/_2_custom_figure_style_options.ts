// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AnchorPoint,
  assert,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  type PaddingOptions,
} from "./deps.ts";
import type {
  GenericAreaStyleOptions,
  GenericBarStyleOptions,
  GenericLineStyleOptions,
  GenericPointStyleOptions,
  GenericSeriesInfoFunc,
  GenericValueInfoFunc,
  TableCellFormatterFunc,
} from "./style_func_types.ts";
import type { FigureTextStyleOptions } from "./text_style_keys.ts";
import type { AspectRatio, LegendPosition } from "./types.ts";
import type { CalendarType } from "./deps.ts";

export type CustomFigureStyleOptions = {
  scale?: number;
  idealAspectRatio?: "none" | AspectRatio;
  seriesColorFunc?: GenericSeriesInfoFunc<ColorKeyOrString>;

  hideColHeaders?: boolean;
  chartAreaBackgroundColor?: ColorKeyOrString | "none";

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
    cellBackgroundColorFormatter?:
      | "none"
      | TableCellFormatterFunc<
        string | number | null | undefined,
        ColorKeyOrString
      >;
    cellValueFormatter?: TableCellFormatterFunc<
      string | number | null | undefined,
      string
    >;
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
  xTextAxis?: {
    verticalTickLabels?: boolean;
    tickPosition?: "sides" | "center";
    tickHeight?: number;
    tickLabelGap?: number;
    lanePaddingLeft?: number;
    lanePaddingRight?: number;
    laneGapX?: number;
  };
  xScaleAxis?: {
    max?: number | "auto";
    min?: number | "auto";
    labelGap?: number;
    tickHeight?: number;
    tickLabelGap?: number;
    tickLabelFormatter?: (v: number) => string;
  };
  xPeriodAxis?: {
    lanePaddingLeft?: number;
    lanePaddingRight?: number;
    laneGapX?: number;
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
    colHeight?: number;
    paddingTop?: number;
    paddingBottom?: number;
    labelGap?: number;
    tickWidth?: number;
    tickLabelGap?: number;
    logicTickLabelWidth?: "auto" | "fixed";
    logicColGroupLabelWidth?: "auto" | "fixed";
    maxTickLabelWidthAsPctOfChart?: number;
    maxColGroupLabelWidthAsPctOfChart?: number;
    colGroupGap?: number;
    colGroupBracketGapLeft?: number;
    colGroupBracketGapRight?: number;
    colGroupBracketPaddingY?: number;
    colGroupBracketTickWidth?: number;
    verticalColGroupLabels?: boolean;
  };
  yScaleAxis?: {
    max?: number | "auto" | ((i_series: number) => number);
    min?: number | "auto" | ((i_series: number) => number);
    labelGap?: number;
    tickWidth?: number;
    tickLabelGap?: number;
    tickLabelFormatter?: (v: number) => string;
    forceTopOverhangHeight?: "none" | number;
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
    points?: {
      defaults?: GenericPointStyleOptions;
      func?: GenericValueInfoFunc<GenericPointStyleOptions> | "none";
    };
    bars?: {
      defaults?: GenericBarStyleOptions;
      func?: GenericValueInfoFunc<GenericBarStyleOptions> | "none";
      stacking?: "none" | "stacked" | "imposed" | "uncertainty";
      maxBarWidth?: number;
    };
    lines?: {
      defaults?: GenericLineStyleOptions;
      func?: GenericSeriesInfoFunc<GenericLineStyleOptions> | "none";
      joinAcrossGaps?: boolean;
    };
    areas?: {
      defaults?: GenericAreaStyleOptions;
      func?: GenericSeriesInfoFunc<GenericAreaStyleOptions> | "none";
      diff?: {
        enabled?: boolean;
        // order?: "actual-expected" | "expected-actual";
      };
    };
    withDataLabels?: boolean;
    dataLabelFormatter?: GenericValueInfoFunc<string | undefined>;
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
    padding?: PaddingOptions;
    backgroundColor?: ColorKeyOrString | "none";
    headerGap?: number;
    headerAlignment?: "left" | "center" | "right";
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
      textHorizontalAlign?: "left" | "center" | "right";
      textVerticalAlign?: "top" | "center" | "bottom";
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
};

let _GS: CustomFigureStyleOptions | undefined = undefined;

export function setGlobalFigureStyle(gs: CustomFigureStyleOptions): void {
  assert(_GS === undefined, "Global figure styles have already been set");
  _GS = gs;
}

export function getGlobalFigureStyle(): CustomFigureStyleOptions {
  return _GS ?? {};
}
