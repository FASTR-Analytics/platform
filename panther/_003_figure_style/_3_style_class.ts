// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedSurroundsStyle } from "./_3_merged_style_return_types.ts";
import {
  type DefaultFigureStyle,
  getDefaultFigureStyle,
} from "./_1_default_figure_style.ts";
import {
  type CustomFigureStyleOptions,
  getGlobalFigureStyle,
} from "./_2_custom_figure_style_options.ts";
import type {
  MergedChartOHStyle,
  MergedChartOVStyle,
  MergedChartStyleBase,
  MergedContentStyle,
  MergedGridStyle,
  MergedLegendStyle,
  MergedMapStyle,
  MergedPaneStyle,
  MergedSankeyStyle,
  MergedScaleLegendStyle,
  MergedSimpleVizStyle,
  MergedTableStyle,
  MergedTimeseriesStyle,
  MergedXPeriodAxisStyle,
  MergedXScaleAxisStyle,
  MergedXTextAxisStyle,
  MergedYScaleAxisStyle,
  MergedYTextAxisStyle,
} from "./_3_merged_style_return_types.ts";
import {
  type FontInfo,
  getBaseText,
  getBaseTextInfo,
  getColor,
  getFontsToRegister,
  getTextInfo,
  m,
  ms,
  msOrNone,
  msPadding,
  type TextInfo,
  type ValuesColorFunc,
} from "./deps.ts";
import {
  getAreaStyleFunc,
  getBarStyleFunc,
  getCascadeArrowStyleFunc,
  getConfidenceBandStyleFunc,
  getErrorBarStyleFunc,
  getLineStyleFunc,
  getMapRegionStyleFunc,
  getPointStyleFunc,
  getTableCellStyleFunc,
} from "./style_func_types.ts";
import { FIGURE_TEXT_STYLE_KEYS } from "./text_style_keys.ts";

export class CustomFigureStyle {
  private _d: DefaultFigureStyle;
  private _g: CustomFigureStyleOptions;
  private _c: CustomFigureStyleOptions;
  private _sf: number;
  private _baseText: TextInfo;

  constructor(
    customStyle: CustomFigureStyleOptions | undefined,
    responsiveScale?: number,
  ) {
    this._d = getDefaultFigureStyle();
    this._g = getGlobalFigureStyle();
    this._c = customStyle ?? {};
    this._sf = (this._c?.scale ?? this._g?.scale ?? this._d.scale) *
      (responsiveScale ?? 1);
    this._baseText = getBaseTextInfo(
      this._c.text?.base,
      this._g.text?.base,
      getBaseText(),
      this._sf,
    );
  }

  get sf(): number {
    return this._sf;
  }

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
  getMergedSurroundsStyle(): MergedSurroundsStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: {
        caption: getTextInfo(c.text?.caption, g.text?.caption, baseText),
        subCaption: getTextInfo(
          c.text?.subCaption,
          g.text?.subCaption,
          baseText,
        ),
        footnote: getTextInfo(c.text?.footnote, g.text?.footnote, baseText),
      },
      backgroundColor: getColor(
        m(
          c.surrounds?.backgroundColor,
          g.surrounds?.backgroundColor,
          d.surrounds.backgroundColor,
        ),
      ),
      padding: msPadding(
        sf,
        c.surrounds?.padding,
        g.surrounds?.padding,
        d.surrounds.padding,
      ),
      captionGap: ms(
        sf,
        c.surrounds?.captionGap,
        g.surrounds?.captionGap,
        d.surrounds.captionGap,
      ),
      subCaptionTopPadding: ms(
        sf,
        c.surrounds?.subCaptionTopPadding,
        g.surrounds?.subCaptionTopPadding,
        d.surrounds.subCaptionTopPadding,
      ),
      footnoteGap: ms(
        sf,
        c.surrounds?.footnoteGap,
        g.surrounds?.footnoteGap,
        d.surrounds.footnoteGap,
      ),
      legendGap: ms(
        sf,
        c.surrounds?.legendGap,
        g.surrounds?.legendGap,
        d.surrounds.legendGap,
      ),
      legendPosition: m(
        c.surrounds?.legendPosition,
        g.surrounds?.legendPosition,
        d.surrounds.legendPosition,
      ),
      captionAlignH: m(
        c.surrounds?.captionAlignH,
        g.surrounds?.captionAlignH,
        d.surrounds.captionAlignH,
      ),
      subCaptionAlignH: m(
        c.surrounds?.subCaptionAlignH,
        g.surrounds?.subCaptionAlignH,
        d.surrounds.subCaptionAlignH,
      ),
      footnoteAlignH: m(
        c.surrounds?.footnoteAlignH,
        g.surrounds?.footnoteAlignH,
        d.surrounds.footnoteAlignH,
      ),

      // Nested style objects
      legend: this.getMergedLegendStyle(),
    };
  }

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
  private getMergedLegendStyle(): MergedLegendStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: getTextInfo(c.text?.legend, g.text?.legend, baseText),
      seriesColorFunc: m(
        c.seriesColorFunc,
        g.seriesColorFunc,
        d.seriesColorFunc,
      ),
      maxLegendItemsInOneColumn: m(
        c.legend?.maxLegendItemsInOneColumn,
        g.legend?.maxLegendItemsInOneColumn,
        d.legend.maxLegendItemsInOneColumn,
      ),
      legendColorBoxWidth: ms(
        sf,
        c.legend?.legendColorBoxWidth,
        g.legend?.legendColorBoxWidth,
        d.legend.legendColorBoxWidth,
      ),
      legendItemVerticalGap: ms(
        sf,
        c.legend?.legendItemVerticalGap,
        g.legend?.legendItemVerticalGap,
        d.legend.legendItemVerticalGap,
      ),
      legendLabelGap: ms(
        sf,
        c.legend?.legendLabelGap,
        g.legend?.legendLabelGap,
        d.legend.legendLabelGap,
      ),
      legendPointRadius: ms(
        sf,
        c.legend?.legendPointRadius,
        g.legend?.legendPointRadius,
        d.legend.legendPointRadius,
      ),
      legendPointStrokeWidth: ms(
        sf,
        c.legend?.legendPointStrokeWidth,
        g.legend?.legendPointStrokeWidth,
        d.legend.legendPointStrokeWidth,
      ),
      legendLineStrokeWidth: ms(
        sf,
        c.legend?.legendLineStrokeWidth,
        g.legend?.legendLineStrokeWidth,
        d.legend.legendLineStrokeWidth,
      ),
      legendPointInnerColorStrategy: m(
        c.legend?.legendPointInnerColorStrategy,
        g.legend?.legendPointInnerColorStrategy,
        d.legend.legendPointInnerColorStrategy,
      ),
      reverseOrder: m(
        c.legend?.reverseOrder,
        g.legend?.reverseOrder,
        d.legend.reverseOrder,
      ),
      legendNoRender: m(
        c.legend?.legendNoRender,
        g.legend?.legendNoRender,
        d.legend.legendNoRender,
      ),
    };
  }

  getMergedScaleLegendStyle(): MergedScaleLegendStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      alreadyScaledValue: sf,
      text: getTextInfo(c.text?.legend, g.text?.legend, baseText),
      barHeight: ms(
        sf,
        c.scaleLegend?.barHeight,
        g.scaleLegend?.barHeight,
        d.scaleLegend.barHeight,
      ),
      tickLength: ms(
        sf,
        c.scaleLegend?.tickLength,
        g.scaleLegend?.tickLength,
        d.scaleLegend.tickLength,
      ),
      labelGap: ms(
        sf,
        c.scaleLegend?.labelGap,
        g.scaleLegend?.labelGap,
        d.scaleLegend.labelGap,
      ),
      blockGap: ms(
        sf,
        c.scaleLegend?.blockGap,
        g.scaleLegend?.blockGap,
        d.scaleLegend.blockGap,
      ),
      noDataGap: ms(
        sf,
        c.scaleLegend?.noDataGap,
        g.scaleLegend?.noDataGap,
        d.scaleLegend.noDataGap,
      ),
      noDataSwatchWidth: ms(
        sf,
        c.scaleLegend?.noDataSwatchWidth,
        g.scaleLegend?.noDataSwatchWidth,
        d.scaleLegend.noDataSwatchWidth,
      ),
    };
  }

  getValuesColorFunc(): ValuesColorFunc {
    return m(
      this._c.valuesColorFunc,
      this._g.valuesColorFunc,
      this._d.valuesColorFunc,
    );
  }

  /////////////////////////////////////////////////////////////////
  //   ______   __                              __               //
  //  /      \ /  |                            /  |              //
  // /$$$$$$  |$$ |____    ______    ______   _$$ |_    _______  //
  // $$ |  $$/ $$      \  /      \  /      \ / $$   |  /       | //
  // $$ |      $$$$$$$  | $$$$$$  |/$$$$$$  |$$$$$$/  /$$$$$$$/  //
  // $$ |   __ $$ |  $$ | /    $$ |$$ |  $$/   $$ | __$$      \  //
  // $$ \__/  |$$ |  $$ |/$$$$$$$ |$$ |        $$ |/  |$$$$$$  | //
  // $$    $$/ $$ |  $$ |$$    $$ |$$ |        $$  $$//     $$/  //
  //  $$$$$$/  $$/   $$/  $$$$$$$/ $$/          $$$$/ $$$$$$$/   //
  //                                                             //
  /////////////////////////////////////////////////////////////////

  private getMergedChartStyleBase(): MergedChartStyleBase {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;
    return {
      alreadyScaledValue: sf,
      text: {
        paneHeaders: getTextInfo(
          c.text?.paneHeaders,
          g.text?.paneHeaders,
          baseText,
        ),
        laneHeaders: getTextInfo(
          c.text?.laneHeaders,
          g.text?.laneHeaders,
          baseText,
        ),
        tierHeaders: getTextInfo(
          c.text?.tierHeaders,
          g.text?.tierHeaders,
          baseText,
        ),
        dataLabels: getTextInfo(
          c.text?.dataLabels,
          g.text?.dataLabels,
          baseText,
        ),
      },
      lanes: {
        hideHeaders: m(
          c.lanes?.hideHeaders,
          g.lanes?.hideHeaders,
          d.lanes.hideHeaders,
        ),
        paddingLeft: ms(
          sf,
          c.lanes?.paddingLeft,
          g.lanes?.paddingLeft,
          d.lanes.paddingLeft,
        ),
        paddingRight: ms(
          sf,
          c.lanes?.paddingRight,
          g.lanes?.paddingRight,
          d.lanes.paddingRight,
        ),
        gapX: ms(sf, c.lanes?.gapX, g.lanes?.gapX, d.lanes.gapX),
        headerAlignH: m(
          c.lanes?.headerAlignH,
          g.lanes?.headerAlignH,
          d.lanes.headerAlignH,
        ),
        headerGap: ms(
          sf,
          c.lanes?.headerGap,
          g.lanes?.headerGap,
          d.lanes.headerGap,
        ),
      },
      tiers: {
        hideHeaders: m(
          c.tiers?.hideHeaders,
          g.tiers?.hideHeaders,
          d.tiers.hideHeaders,
        ),
        paddingTop: ms(
          sf,
          c.tiers?.paddingTop,
          g.tiers?.paddingTop,
          d.tiers.paddingTop,
        ),
        paddingBottom: ms(
          sf,
          c.tiers?.paddingBottom,
          g.tiers?.paddingBottom,
          d.tiers.paddingBottom,
        ),
        gapY: ms(sf, c.tiers?.gapY, g.tiers?.gapY, d.tiers.gapY),
        maxHeaderWidthAsPctOfChart: m(
          c.tiers?.maxHeaderWidthAsPctOfChart,
          g.tiers?.maxHeaderWidthAsPctOfChart,
          d.tiers.maxHeaderWidthAsPctOfChart,
        ),
        headerAlignH: m(
          c.tiers?.headerAlignH,
          g.tiers?.headerAlignH,
          d.tiers.headerAlignH,
        ),
        headerAlignV: m(
          c.tiers?.headerAlignV,
          g.tiers?.headerAlignV,
          d.tiers.headerAlignV,
        ),
        headerPosition: m(
          c.tiers?.headerPosition,
          g.tiers?.headerPosition,
          d.tiers.headerPosition,
        ),
        headerGap: ms(
          sf,
          c.tiers?.headerGap,
          g.tiers?.headerGap,
          d.tiers.headerGap,
        ),
      },
      content: this.getMergedContentStyle(),
      grid: this.getMergedGridStyle(),
      panes: this.getMergedPaneStyle(),
    };
  }

  getMergedChartOVStyle(): MergedChartOVStyle {
    return {
      ...this.getMergedChartStyleBase(),
      yScaleAxis: this.getMergedYScaleAxisStyle(),
      xTextAxis: this.getMergedXTextAxisStyle(),
    };
  }

  getMergedChartOHStyle(): MergedChartOHStyle {
    return {
      ...this.getMergedChartStyleBase(),
      xScaleAxis: this.getMergedXScaleAxisStyle(),
      yTextAxis: this.getMergedYTextAxisStyle(),
    };
  }

  getMergedTimeseriesStyle(): MergedTimeseriesStyle {
    return {
      ...this.getMergedChartStyleBase(),
      yScaleAxis: this.getMergedYScaleAxisStyle(),
      xPeriodAxis: this.getMergedXPeriodAxisStyle(),
    };
  }

  getMergedMapStyle(): MergedMapStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    return {
      ...this.getMergedChartStyleBase(),
      map: {
        projection: m(c.map?.projection, g.map?.projection, d.map.projection),
        fit: m(c.map?.fit, g.map?.fit, d.map.fit),
        boundingBox: m(
          c.map?.boundingBox,
          g.map?.boundingBox,
          d.map.boundingBox,
        ),
        dataLabelMode: m(
          c.map?.dataLabelMode,
          g.map?.dataLabelMode,
          d.map.dataLabelMode,
        ),
        calloutMargin: ms(
          sf,
          c.map?.calloutMargin,
          g.map?.calloutMargin,
          d.map.calloutMargin,
        ),
        labelPositioning: m(
          c.map?.labelPositioning,
          g.map?.labelPositioning,
          d.map.labelPositioning,
        ),
        labelCollision: {
          gap: ms(
            sf,
            c.map?.labelCollision?.gap,
            g.map?.labelCollision?.gap,
            d.map.labelCollision.gap,
          ),
          maxCentroidDisplacement: ms(
            sf,
            c.map?.labelCollision?.maxCentroidDisplacement,
            g.map?.labelCollision?.maxCentroidDisplacement,
            d.map.labelCollision.maxCentroidDisplacement,
          ),
          maxIterations: m(
            c.map?.labelCollision?.maxIterations,
            g.map?.labelCollision?.maxIterations,
            d.map.labelCollision.maxIterations,
          ),
        },
      },
    };
  }

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

  getMergedTableStyle(): MergedTableStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;

    return {
      alreadyScaledValue: sf,
      text: {
        colHeaders: getTextInfo(
          c.text?.colHeaders,
          g.text?.colHeaders,
          baseText,
        ),
        colGroupHeaders: getTextInfo(
          c.text?.colGroupHeaders,
          g.text?.colGroupHeaders,
          baseText,
        ),
        rowHeaders: getTextInfo(
          c.text?.rowHeaders,
          g.text?.rowHeaders,
          baseText,
        ),
        rowGroupHeaders: getTextInfo(
          c.text?.rowGroupHeaders,
          g.text?.rowGroupHeaders,
          baseText,
        ),
        cells: getTextInfo(c.text?.cells, g.text?.cells, baseText),
      },
      rowHeaderIndentIfRowGroups: ms(
        sf,
        c.table?.rowHeaderIndentIfRowGroups,
        g.table?.rowHeaderIndentIfRowGroups,
        d.table.rowHeaderIndentIfRowGroups,
      ),
      verticalColHeaders: m(
        c.table?.verticalColHeaders,
        g.table?.verticalColHeaders,
        d.table.verticalColHeaders,
      ),
      maxHeightForVerticalColHeaders: ms(
        sf,
        c.table?.maxHeightForVerticalColHeaders,
        g.table?.maxHeightForVerticalColHeaders,
        d.table.maxHeightForVerticalColHeaders,
      ),
      tableCells: {
        getStyle: getTableCellStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.tableCells?.textFormatter,
          g.content?.tableCells?.textFormatter,
          d.content.tableCells.textFormatter,
        ),
      },
      colHeaderPadding: msPadding(
        sf,
        c.table?.colHeaderPadding,
        g.table?.colHeaderPadding,
        d.table.colHeaderPadding,
      ),
      rowHeaderPadding: msPadding(
        sf,
        c.table?.rowHeaderPadding,
        g.table?.rowHeaderPadding,
        d.table.rowHeaderPadding,
      ),
      cellPadding: msPadding(
        sf,
        c.table?.cellPadding,
        g.table?.cellPadding,
        d.table.cellPadding,
      ),
      alignV: m(
        c.table?.alignV,
        g.table?.alignV,
        d.table.alignV,
      ),
      colHeaderBackgroundColor: getColor(
        m(
          c.table?.colHeaderBackgroundColor,
          g.table?.colHeaderBackgroundColor,
          d.table.colHeaderBackgroundColor,
        ),
      ),
      colGroupHeaderBackgroundColor: getColor(
        m(
          c.table?.colGroupHeaderBackgroundColor,
          g.table?.colGroupHeaderBackgroundColor,
          d.table.colGroupHeaderBackgroundColor,
        ),
      ),
      headerBorderWidth: ms(
        sf,
        c.table?.headerBorderWidth,
        g.table?.headerBorderWidth,
        d.table.headerBorderWidth,
      ),
      gridLineWidth: ms(
        sf,
        c.table?.gridLineWidth,
        g.table?.gridLineWidth,
        d.table.gridLineWidth,
      ),
      borderWidth: ms(
        sf,
        c.table?.borderWidth,
        g.table?.borderWidth,
        d.table.borderWidth,
      ),
      headerBorderColor: getColor(
        m(
          c.table?.headerBorderColor,
          g.table?.headerBorderColor,
          d.table.headerBorderColor,
        ),
      ),
      gridLineColor: getColor(
        m(
          c.table?.gridLineColor,
          g.table?.gridLineColor,
          d.table.gridLineColor,
        ),
      ),
      borderColor: getColor(
        m(c.table?.borderColor, g.table?.borderColor, d.table.borderColor),
      ),
    };
  }

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

  private getMergedYScaleAxisStyle(): MergedYScaleAxisStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;
    return {
      text: {
        yScaleAxisTickLabels: getTextInfo(
          c.text?.yScaleAxisTickLabels,
          g.text?.yScaleAxisTickLabels,
          baseText,
        ),
        yScaleAxisLabel: getTextInfo(
          c.text?.yScaleAxisLabel,
          g.text?.yScaleAxisLabel,
          baseText,
        ),
      },
      max: m(c.yScaleAxis?.max, g.yScaleAxis?.max, d.yScaleAxis.max),
      min: m(c.yScaleAxis?.min, g.yScaleAxis?.min, d.yScaleAxis.min),
      labelGap: ms(
        sf,
        c.yScaleAxis?.labelGap,
        g.yScaleAxis?.labelGap,
        d.yScaleAxis.labelGap,
      ),
      tickWidth: ms(
        sf,
        c.yScaleAxis?.tickWidth,
        g.yScaleAxis?.tickWidth,
        d.yScaleAxis.tickWidth,
      ),
      tickLabelGap: ms(
        sf,
        c.yScaleAxis?.tickLabelGap,
        g.yScaleAxis?.tickLabelGap,
        d.yScaleAxis.tickLabelGap,
      ),
      tickLabelFormatter: m(
        c.yScaleAxis?.tickLabelFormatter,
        g.yScaleAxis?.tickLabelFormatter,
        d.yScaleAxis.tickLabelFormatter,
      ),
      forceTopOverhangHeight: msOrNone(
        sf,
        c.yScaleAxis?.forceTopOverhangHeight,
        g.yScaleAxis?.forceTopOverhangHeight,
        d.yScaleAxis.forceTopOverhangHeight,
      ),
      allowIndividualTierLimits: m(
        c.yScaleAxis?.allowIndividualTierLimits,
        g.yScaleAxis?.allowIndividualTierLimits,
        d.yScaleAxis.allowIndividualTierLimits,
      ),
      exactAxisX: msOrNone(
        sf,
        c.yScaleAxis?.exactAxisX,
        g.yScaleAxis?.exactAxisX,
        d.yScaleAxis.exactAxisX,
      ),
    };
  }

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

  private getMergedXTextAxisStyle(): MergedXTextAxisStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: {
        xTextAxisTickLabels: getTextInfo(
          c.text?.xTextAxisTickLabels,
          g.text?.xTextAxisTickLabels,
          baseText,
        ),
      },
      verticalTickLabels: m(
        c.xTextAxis?.verticalTickLabels,
        g.xTextAxis?.verticalTickLabels,
        d.xTextAxis.verticalTickLabels,
      ),
      tickHeight: ms(
        sf,
        c.xTextAxis?.tickHeight,
        g.xTextAxis?.tickHeight,
        d.xTextAxis.tickHeight,
      ),
      tickPosition: m(
        c.xTextAxis?.tickPosition,
        g.xTextAxis?.tickPosition,
        d.xTextAxis.tickPosition,
      ),
      tickLabelGap: ms(
        sf,
        c.xTextAxis?.tickLabelGap,
        g.xTextAxis?.tickLabelGap,
        d.xTextAxis.tickLabelGap,
      ),
    };
  }

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

  private getMergedXPeriodAxisStyle(): MergedXPeriodAxisStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: {
        xPeriodAxisTickLabels: getTextInfo(
          c.text?.xPeriodAxisTickLabels,
          g.text?.xPeriodAxisTickLabels,
          baseText,
        ),
      },
      forceSideTicksWhenYear: m(
        c.xPeriodAxis?.forceSideTicksWhenYear,
        g.xPeriodAxis?.forceSideTicksWhenYear,
        d.xPeriodAxis.forceSideTicksWhenYear,
      ),
      showEveryNthTick: m(
        c.xPeriodAxis?.showEveryNthTick,
        g.xPeriodAxis?.showEveryNthTick,
        d.xPeriodAxis.showEveryNthTick,
      ),
      periodLabelSmallTopPadding: ms(
        sf,
        c.xPeriodAxis?.periodLabelSmallTopPadding,
        g.xPeriodAxis?.periodLabelSmallTopPadding,
        d.xPeriodAxis.periodLabelSmallTopPadding,
      ),
      periodLabelLargeTopPadding: ms(
        sf,
        c.xPeriodAxis?.periodLabelLargeTopPadding,
        g.xPeriodAxis?.periodLabelLargeTopPadding,
        d.xPeriodAxis.periodLabelLargeTopPadding,
      ),
      calendar: m(
        c.xPeriodAxis?.calendar,
        g.xPeriodAxis?.calendar,
        d.xPeriodAxis.calendar,
      ),
    };
  }

  private getMergedXScaleAxisStyle(): MergedXScaleAxisStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: {
        xScaleAxisTickLabels: getTextInfo(
          c.text?.xScaleAxisTickLabels,
          g.text?.xScaleAxisTickLabels,
          baseText,
        ),
        xScaleAxisLabel: getTextInfo(
          c.text?.xScaleAxisLabel,
          g.text?.xScaleAxisLabel,
          baseText,
        ),
      },
      max: m(c.xScaleAxis?.max, g.xScaleAxis?.max, d.xScaleAxis.max),
      min: m(c.xScaleAxis?.min, g.xScaleAxis?.min, d.xScaleAxis.min),
      labelGap: ms(
        sf,
        c.xScaleAxis?.labelGap,
        g.xScaleAxis?.labelGap,
        d.xScaleAxis.labelGap,
      ),
      tickHeight: ms(
        sf,
        c.xScaleAxis?.tickHeight,
        g.xScaleAxis?.tickHeight,
        d.xScaleAxis.tickHeight,
      ),
      tickLabelGap: ms(
        sf,
        c.xScaleAxis?.tickLabelGap,
        g.xScaleAxis?.tickLabelGap,
        d.xScaleAxis.tickLabelGap,
      ),
      tickLabelFormatter: m(
        c.xScaleAxis?.tickLabelFormatter,
        g.xScaleAxis?.tickLabelFormatter,
        d.xScaleAxis.tickLabelFormatter,
      ),
      forceRightOverhangWidth: msOrNone(
        sf,
        c.xScaleAxis?.forceRightOverhangWidth,
        g.xScaleAxis?.forceRightOverhangWidth,
        d.xScaleAxis.forceRightOverhangWidth,
      ),
      allowIndividualLaneLimits: m(
        c.xScaleAxis?.allowIndividualLaneLimits,
        g.xScaleAxis?.allowIndividualLaneLimits,
        d.xScaleAxis.allowIndividualLaneLimits,
      ),
      exactAxisY: msOrNone(
        sf,
        c.xScaleAxis?.exactAxisY,
        g.xScaleAxis?.exactAxisY,
        d.xScaleAxis.exactAxisY,
      ),
    };
  }

  private getMergedYTextAxisStyle(): MergedYTextAxisStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    return {
      text: {
        yTextAxisTickLabels: getTextInfo(
          c.text?.yTextAxisTickLabels,
          g.text?.yTextAxisTickLabels,
          baseText,
        ),
        yTextAxisLabel: getTextInfo(
          c.text?.yTextAxisLabel,
          g.text?.yTextAxisLabel,
          baseText,
        ),
      },
      tickWidth: ms(
        sf,
        c.yTextAxis?.tickWidth,
        g.yTextAxis?.tickWidth,
        d.yTextAxis.tickWidth,
      ),
      tickLabelGap: ms(
        sf,
        c.yTextAxis?.tickLabelGap,
        g.yTextAxis?.tickLabelGap,
        d.yTextAxis.tickLabelGap,
      ),
      labelGap: ms(
        sf,
        c.yTextAxis?.labelGap,
        g.yTextAxis?.labelGap,
        d.yTextAxis.labelGap,
      ),
      tickPosition: m(
        c.yTextAxis?.tickPosition,
        g.yTextAxis?.tickPosition,
        d.yTextAxis.tickPosition,
      ),
      colHeight: ms(
        sf,
        c.yTextAxis?.colHeight,
        g.yTextAxis?.colHeight,
        d.yTextAxis.colHeight,
      ),
      paddingTop: ms(
        sf,
        c.yTextAxis?.paddingTop,
        g.yTextAxis?.paddingTop,
        d.yTextAxis.paddingTop,
      ),
      paddingBottom: ms(
        sf,
        c.yTextAxis?.paddingBottom,
        g.yTextAxis?.paddingBottom,
        d.yTextAxis.paddingBottom,
      ),
      logicTickLabelWidth: m(
        c.yTextAxis?.logicTickLabelWidth,
        g.yTextAxis?.logicTickLabelWidth,
        d.yTextAxis.logicTickLabelWidth,
      ),
      maxTickLabelWidthAsPctOfChart: m(
        c.yTextAxis?.maxTickLabelWidthAsPctOfChart,
        g.yTextAxis?.maxTickLabelWidthAsPctOfChart,
        d.yTextAxis.maxTickLabelWidthAsPctOfChart,
      ),
    };
  }

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

  private getMergedGridStyle(): MergedGridStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    return {
      showGrid: m(c.grid?.showGrid, g.grid?.showGrid, d.grid.showGrid),
      axisStrokeWidth: ms(
        this._sf,
        c.grid?.axisStrokeWidth,
        g.grid?.axisStrokeWidth,
        d.grid.axisStrokeWidth,
      ),
      gridStrokeWidth: ms(
        this._sf,
        c.grid?.gridStrokeWidth,
        g.grid?.gridStrokeWidth,
        d.grid.gridStrokeWidth,
      ),
      axisColor: getColor(
        m(c.grid?.axisColor, g.grid?.axisColor, d.grid.axisColor),
      ),
      gridColor: getColor(
        m(c.grid?.gridColor, g.grid?.gridColor, d.grid.gridColor),
      ),
      backgroundColor: getColor(
        m(
          c.grid?.backgroundColor,
          g.grid?.backgroundColor,
          d.grid.backgroundColor,
        ),
      ),
    };
  }

  ////////////////////////////////////////////
  //   ______             __  __            //
  //  /      \           /  |/  |           //
  // /$$$$$$  |  ______  $$ |$$ |  _______  //
  // $$ |  $$/  /      \ $$ |$$ | /       | //
  // $$ |      /$$$$$$  |$$ |$$ |/$$$$$$$/  //
  // $$ |   __ $$    $$ |$$ |$$ |$$      \  //
  // $$ \__/  |$$$$$$$$/ $$ |$$ | $$$$$$  | //
  // $$    $$/ $$       |$$ |$$ |/     $$/  //
  //  $$$$$$/   $$$$$$$/ $$/ $$/ $$$$$$$/   //
  //                                        //
  ////////////////////////////////////////////

  private getMergedPaneStyle(): MergedPaneStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    return {
      hideHeaders: m(
        c.panes?.hideHeaders,
        g.panes?.hideHeaders,
        d.panes.hideHeaders,
      ),
      nCols: m(c.panes?.nCols, g.panes?.nCols, d.panes.nCols),
      gapX: ms(sf, c.panes?.gapX, g.panes?.gapX, d.panes.gapX),
      gapY: ms(sf, c.panes?.gapY, g.panes?.gapY, d.panes.gapY),
      padding: msPadding(
        sf,
        c.panes?.padding,
        g.panes?.padding,
        d.panes.padding,
      ),
      backgroundColor: getColor(
        m(
          c.panes?.backgroundColor,
          g.panes?.backgroundColor,
          d.panes.backgroundColor,
        ),
      ),
      headerGap: ms(
        sf,
        c.panes?.headerGap,
        g.panes?.headerGap,
        d.panes.headerGap,
      ),
      headerAlignH: m(
        c.panes?.headerAlignH,
        g.panes?.headerAlignH,
        d.panes.headerAlignH,
      ),
    };
  }

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

  private getMergedContentStyle(): MergedContentStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;
    return {
      points: {
        getStyle: getPointStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.points?.textFormatter,
          g.content?.points?.textFormatter,
          d.content.points.textFormatter,
        ),
      },
      bars: {
        getStyle: getBarStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.bars?.textFormatter,
          g.content?.bars?.textFormatter,
          d.content.bars.textFormatter,
        ),
        stacking: m(
          c.content?.bars?.stacking,
          g.content?.bars?.stacking,
          d.content.bars.stacking,
        ),
        maxBarWidth: ms(
          sf,
          c.content?.bars?.maxBarWidth,
          g.content?.bars?.maxBarWidth,
          d.content.bars.maxBarWidth,
        ),
      },
      lines: {
        getStyle: getLineStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.lines?.textFormatter,
          g.content?.lines?.textFormatter,
          d.content.lines.textFormatter,
        ),
        joinAcrossGaps: m(
          c.content?.lines?.joinAcrossGaps,
          g.content?.lines?.joinAcrossGaps,
          d.content.lines.joinAcrossGaps,
        ),
      },
      areas: {
        getStyle: getAreaStyleFunc(sf, c, g, d),
        joinAcrossGaps: m(
          c.content?.areas?.joinAcrossGaps,
          g.content?.areas?.joinAcrossGaps,
          d.content.areas.joinAcrossGaps,
        ),
        diff: {
          enabled: m(
            c.content?.areas?.diff?.enabled,
            g.content?.areas?.diff?.enabled,
            d.content.areas.diff.enabled,
          ),
        },
      },
      errorBars: {
        getStyle: getErrorBarStyleFunc(sf, c, g, d),
      },
      confidenceBands: {
        getStyle: getConfidenceBandStyleFunc(sf, c, g, d),
      },
      cascadeArrows: {
        text: {
          labels: getTextInfo(
            c.text?.dataLabels,
            g.text?.dataLabels,
            baseText,
          ),
        },
        getStyle: getCascadeArrowStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.cascadeArrows?.textFormatter,
          g.content?.cascadeArrows?.textFormatter,
          d.content.cascadeArrows.textFormatter,
        ),
      },
      mapRegions: {
        getStyle: getMapRegionStyleFunc(sf, c, g, d),
        textFormatter: m(
          c.content?.mapRegions?.textFormatter,
          g.content?.mapRegions?.textFormatter,
          d.content.mapRegions.textFormatter,
        ),
      },
    };
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ______        __                      __                                                            __      //
  // /      |      /  |                    /  |                                                          /  |     //
  // $$$$$$/   ____$$ |  ______    ______  $$ |        ______    _______   ______    ______    _______  _$$ |_    //
  //   $$ |   /    $$ | /      \  /      \ $$ |       /      \  /       | /      \  /      \  /       |/ $$   |   //
  //   $$ |  /$$$$$$$ |/$$$$$$  | $$$$$$  |$$ |       $$$$$$  |/$$$$$$$/ /$$$$$$  |/$$$$$$  |/$$$$$$$/ $$$$$$/    //
  //   $$ |  $$ |  $$ |$$    $$ | /    $$ |$$ |       /    $$ |$$      \ $$ |  $$ |$$    $$ |$$ |        $$ | __  //
  //  _$$ |_ $$ \__$$ |$$$$$$$$/ /$$$$$$$ |$$ |      /$$$$$$$ | $$$$$$  |$$ |__$$ |$$$$$$$$/ $$ \_____   $$ |/  | //
  // / $$   |$$    $$ |$$       |$$    $$ |$$ |      $$    $$ |/     $$/ $$    $$/ $$       |$$       |  $$  $$/  //
  // $$$$$$/  $$$$$$$/  $$$$$$$/  $$$$$$$/ $$/        $$$$$$$/ $$$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/    $$$$/   //
  //                                                                     $$ |                                     //
  //                                                                     $$ |                                     //
  //                                                                     $$/                                      //
  //                                                                                                              //
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////

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

  getMergedSimpleVizStyle(): MergedSimpleVizStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;
    return {
      alreadyScaledValue: sf,
      layerGap: ms(
        sf,
        c.simpleviz?.layerGap,
        g.simpleviz?.layerGap,
        d.simpleviz.layerGap,
      ),
      orderGap: ms(
        sf,
        c.simpleviz?.orderGap,
        g.simpleviz?.orderGap,
        d.simpleviz.orderGap,
      ),
      layerAlign: m(
        c.simpleviz?.layerAlign,
        g.simpleviz?.layerAlign,
        d.simpleviz.layerAlign,
      ),
      text: {
        primary: getTextInfo(
          c.text?.simplevizBoxTextPrimary,
          g.text?.simplevizBoxTextPrimary,
          baseText,
        ),
        secondary: getTextInfo(
          c.text?.simplevizBoxTextSecondary,
          g.text?.simplevizBoxTextSecondary,
          baseText,
        ),
        base: baseText,
      },
      boxes: {
        fillColor: getColor(
          m(
            c.simpleviz?.boxes?.fillColor,
            g.simpleviz?.boxes?.fillColor,
            d.simpleviz.boxes.fillColor,
          ),
        ),
        strokeColor: getColor(
          m(
            c.simpleviz?.boxes?.strokeColor,
            g.simpleviz?.boxes?.strokeColor,
            d.simpleviz.boxes.strokeColor,
          ),
        ),
        strokeWidth: ms(
          sf,
          c.simpleviz?.boxes?.strokeWidth,
          g.simpleviz?.boxes?.strokeWidth,
          d.simpleviz.boxes.strokeWidth,
        ),
        alignH: m(
          c.simpleviz?.boxes?.alignH,
          g.simpleviz?.boxes?.alignH,
          d.simpleviz.boxes.alignH,
        ),
        alignV: m(
          c.simpleviz?.boxes?.alignV,
          g.simpleviz?.boxes?.alignV,
          d.simpleviz.boxes.alignV,
        ),
        textGap: ms(
          sf,
          c.simpleviz?.boxes?.textGap,
          g.simpleviz?.boxes?.textGap,
          d.simpleviz.boxes.textGap,
        ),
        padding: msPadding(
          sf,
          c.simpleviz?.boxes?.padding,
          g.simpleviz?.boxes?.padding,
          d.simpleviz.boxes.padding,
        ),
        arrowStartPoint: m(
          c.simpleviz?.boxes?.arrowStartPoint,
          g.simpleviz?.boxes?.arrowStartPoint,
          d.simpleviz.boxes.arrowStartPoint,
        ),
        arrowEndPoint: m(
          c.simpleviz?.boxes?.arrowEndPoint,
          g.simpleviz?.boxes?.arrowEndPoint,
          d.simpleviz.boxes.arrowEndPoint,
        ),
      },
      arrows: {
        strokeColor: getColor(
          m(
            c.simpleviz?.arrows?.strokeColor,
            g.simpleviz?.arrows?.strokeColor,
            d.simpleviz.arrows.strokeColor,
          ),
        ),
        strokeWidth: ms(
          sf,
          c.simpleviz?.arrows?.strokeWidth,
          g.simpleviz?.arrows?.strokeWidth,
          d.simpleviz.arrows.strokeWidth,
        ),
        lineDash: m(
          c.simpleviz?.arrows?.lineDash,
          g.simpleviz?.arrows?.lineDash,
          d.simpleviz.arrows.lineDash,
        ),
        truncateStart: ms(
          sf,
          c.simpleviz?.arrows?.truncateStart,
          g.simpleviz?.arrows?.truncateStart,
          d.simpleviz.arrows.truncateStart,
        ),
        truncateEnd: ms(
          sf,
          c.simpleviz?.arrows?.truncateEnd,
          g.simpleviz?.arrows?.truncateEnd,
          d.simpleviz.arrows.truncateEnd,
        ),
      },
    };
  }

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

  getMergedSankeyStyle(): MergedSankeyStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    return {
      alreadyScaledValue: sf,
      nodeWidth: ms(
        sf,
        c.sankey?.nodeWidth,
        g.sankey?.nodeWidth,
        d.sankey.nodeWidth,
      ),
      nodeGap: ms(sf, c.sankey?.nodeGap, g.sankey?.nodeGap, d.sankey.nodeGap),
      columnGap: m(
        c.sankey?.columnGap,
        g.sankey?.columnGap,
        d.sankey.columnGap,
      ),
      labelGap: ms(
        sf,
        c.sankey?.labelGap,
        g.sankey?.labelGap,
        d.sankey.labelGap,
      ),
      linkOpacity: m(
        c.sankey?.linkOpacity,
        g.sankey?.linkOpacity,
        d.sankey.linkOpacity,
      ),
      defaultNodeColor: getColor(
        m(
          c.sankey?.defaultNodeColor,
          g.sankey?.defaultNodeColor,
          d.sankey.defaultNodeColor,
        ),
      ),
      defaultLinkColor: getColor(
        m(
          c.sankey?.defaultLinkColor,
          g.sankey?.defaultLinkColor,
          d.sankey.defaultLinkColor,
        ),
      ),
      layoutMode: m(
        c.sankey?.layoutMode,
        g.sankey?.layoutMode,
        d.sankey.layoutMode,
      ),
    };
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ________                     __                       __                                                    __              __                          //
  // /        |                   /  |                     /  |                                                  /  |            /  |                         //
  // $$$$$$$$/______   _______   _$$ |_    _______        _$$ |_     ______          ______    ______    ______  $$/   _______  _$$ |_     ______    ______   //
  // $$ |__  /      \ /       \ / $$   |  /       |      / $$   |   /      \        /      \  /      \  /      \ /  | /       |/ $$   |   /      \  /      \  //
  // $$    |/$$$$$$  |$$$$$$$  |$$$$$$/  /$$$$$$$/       $$$$$$/   /$$$$$$  |      /$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  | //
  // $$$$$/ $$ |  $$ |$$ |  $$ |  $$ | __$$      \         $$ | __ $$ |  $$ |      $$ |  $$/ $$    $$ |$$ |  $$ |$$ |$$      \   $$ | __ $$    $$ |$$ |  $$/  //
  // $$ |   $$ \__$$ |$$ |  $$ |  $$ |/  |$$$$$$  |        $$ |/  |$$ \__$$ |      $$ |      $$$$$$$$/ $$ \__$$ |$$ | $$$$$$  |  $$ |/  |$$$$$$$$/ $$ |       //
  // $$ |   $$    $$/ $$ |  $$ |  $$  $$//     $$/         $$  $$/ $$    $$/       $$ |      $$       |$$    $$ |$$ |/     $$/   $$  $$/ $$       |$$ |       //
  // $$/     $$$$$$/  $$/   $$/    $$$$/ $$$$$$$/           $$$$/   $$$$$$/        $$/        $$$$$$$/  $$$$$$$ |$$/ $$$$$$$/     $$$$/   $$$$$$$/ $$/        //
  //                                                                                                   /  \__$$ |                                             //
  //                                                                                                   $$    $$/                                              //
  //                                                                                                    $$$$$$/                                               //
  //                                                                                                                                                          //
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getFontsToRegister(): FontInfo[] {
    return getFontsToRegister(
      FIGURE_TEXT_STYLE_KEYS,
      this._c.text,
      this._g.text,
      getBaseText().font,
    );
  }
}
