// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AreaStyle,
  type CascadeArrowInfo,
  type CascadeArrowInfoFunc,
  type ChartSeriesInfo,
  type ChartSeriesInfoFunc,
  type ChartValueInfo,
  type ChartValueInfoFunc,
  type ColorAdjustmentStrategy,
  type ColorKeyOrString,
  type FontInfoOptions,
  type LineStyle,
  m,
  type MapRegionInfo,
  type MapRegionInfoFunc,
  ms,
  msPadding,
  type Padding,
  type PaddingOptions,
  type PointStyle,
  type PointType,
  type RectStyle,
  type TableCellInfo,
  type TableCellInfoFunc,
} from "./deps.ts";
import type { DefaultFigureStyle } from "./_1_default_figure_style.ts";
import type { CustomFigureStyleOptions } from "./_2_custom_figure_style_options.ts";

export type GenericDataLabelStyle = {
  show: boolean;
  color?: ColorKeyOrString;
  relFontSize?: number;
  font?: FontInfoOptions;
  offset: number;
  backgroundColor: ColorKeyOrString | "none";
  padding: PaddingOptions;
  borderColor?: ColorKeyOrString;
  borderWidth: number;
  rectRadius: number;
};

export type GenericDataLabelStyleOptions = Partial<GenericDataLabelStyle>;

export type DataLabelStyle = {
  show: boolean;
  color?: ColorKeyOrString;
  relFontSize?: number;
  font?: FontInfoOptions;
  offset: number;
  backgroundColor: ColorKeyOrString | "none";
  padding: Padding;
  borderColor?: ColorKeyOrString;
  borderWidth: number;
  rectRadius: number;
};

function resolveDataLabelDefaults(
  sf: number,
  c: GenericDataLabelStyleOptions | undefined,
  cc: GenericDataLabelStyleOptions | undefined,
  g: GenericDataLabelStyleOptions | undefined,
  gc: GenericDataLabelStyleOptions | undefined,
  d: GenericDataLabelStyle,
  dc: GenericDataLabelStyle,
): DataLabelStyle {
  return {
    show: c?.show ?? cc?.show ?? g?.show ?? gc?.show ?? d.show ?? dc.show,
    color: c?.color ?? cc?.color ?? g?.color ?? gc?.color ?? d.color ??
      dc.color,
    relFontSize: c?.relFontSize ??
      cc?.relFontSize ??
      g?.relFontSize ??
      gc?.relFontSize ??
      d.relFontSize ??
      dc.relFontSize,
    font: c?.font ?? cc?.font ?? g?.font ?? gc?.font ?? d.font ?? dc.font,
    offset: (c?.offset ??
      cc?.offset ??
      g?.offset ??
      gc?.offset ??
      d.offset ??
      dc.offset) * sf,
    backgroundColor: c?.backgroundColor ??
      cc?.backgroundColor ??
      g?.backgroundColor ??
      gc?.backgroundColor ??
      d.backgroundColor ??
      dc.backgroundColor,
    padding: msPadding(
      sf,
      c?.padding ?? cc?.padding ?? g?.padding ?? gc?.padding,
      d.padding,
      dc.padding,
    ),
    borderColor: c?.borderColor ??
      cc?.borderColor ??
      g?.borderColor ??
      gc?.borderColor ??
      d.borderColor ??
      dc.borderColor,
    borderWidth: ms(
      sf,
      c?.borderWidth ?? cc?.borderWidth ?? g?.borderWidth ?? gc?.borderWidth,
      d.borderWidth,
      dc.borderWidth,
    ),
    rectRadius: (c?.rectRadius ??
      cc?.rectRadius ??
      g?.rectRadius ??
      gc?.rectRadius ??
      d.rectRadius ??
      dc.rectRadius) * sf,
  };
}

function applyDataLabelOverrides(
  defaults: DataLabelStyle,
  o: GenericDataLabelStyleOptions | undefined,
  sf: number,
): DataLabelStyle {
  if (!o) return defaults;
  return {
    show: o.show ?? defaults.show,
    color: o.color ?? defaults.color,
    relFontSize: o.relFontSize ?? defaults.relFontSize,
    font: o.font ?? defaults.font,
    offset: o.offset !== undefined ? o.offset * sf : defaults.offset,
    backgroundColor: o.backgroundColor ?? defaults.backgroundColor,
    padding: o.padding !== undefined
      ? msPadding(sf, o.padding, undefined, 0)
      : defaults.padding,
    borderColor: o.borderColor ?? defaults.borderColor,
    borderWidth: o.borderWidth !== undefined
      ? o.borderWidth * sf
      : defaults.borderWidth,
    rectRadius: o.rectRadius !== undefined
      ? o.rectRadius * sf
      : defaults.rectRadius,
  };
}

export type GenericTableCellStyle = {
  backgroundColor: ColorKeyOrString | 777 | "none";
  textColorStrategy: ColorAdjustmentStrategy | "none";
};

export type GenericTableCellStyleOptions =
  & Partial<GenericTableCellStyle>
  & { annotationGroup?: string };

export type TableCellStyle = {
  backgroundColor: ColorKeyOrString | "none";
  textColorStrategy: ColorAdjustmentStrategy | "none";
  annotationGroup?: string;
};

export function getTableCellStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): TableCellInfoFunc<TableCellStyle> {
  const cRaw = _c.content?.tableCells?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.tableCells?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.tableCells.func;
  const valuesColorFunc = m(
    _c.valuesColorFunc,
    _g.valuesColorFunc,
    _d.valuesColorFunc,
  );
  const dBackgroundColor = m(
    c?.backgroundColor,
    g?.backgroundColor,
    d.backgroundColor,
  );
  const dTextColorStrategy = m(
    c?.textColorStrategy,
    g?.textColorStrategy,
    d.textColorStrategy,
  );

  return (info: TableCellInfo): TableCellStyle => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const backgroundColor = oc?.backgroundColor ?? og?.backgroundColor ??
      dBackgroundColor;
    return {
      backgroundColor:
        backgroundColor === 777 && info.valueAsNumber !== undefined
          ? valuesColorFunc(info.valueAsNumber, info.valueMin, info.valueMax)
          : backgroundColor === 777
          ? "none"
          : backgroundColor,
      textColorStrategy: oc?.textColorStrategy ?? og?.textColorStrategy ??
        dTextColorStrategy,
      annotationGroup: oc?.annotationGroup ?? og?.annotationGroup,
    };
  };
}

//////////////////////////////////////////////////////////
//  _______            __              __               //
// /       \          /  |            /  |              //
// $$$$$$$  | ______  $$/  _______   _$$ |_    _______  //
// $$ |__$$ |/      \ /  |/       \ / $$   |  /       | //
// $$    $$//$$$$$$  |$$ |$$$$$$$  |$$$$$$/  /$$$$$$$/  //
// $$$$$$$/ $$ |  $$ |$$ |$$ |  $$ |  $$ | __$$      \  //
// $$ |     $$ \__$$ |$$ |$$ |  $$ |  $$ |/  |$$$$$$  | //
// $$ |     $$    $$/ $$ |$$ |  $$ |  $$  $$//     $$/  //
// $$/       $$$$$$/  $$/ $$/   $$/    $$$$/ $$$$$$$/   //
//                                                      //
//////////////////////////////////////////////////////////

export type GenericPointStyleOptions = {
  show?: boolean;
  pointStyle?: PointType;
  radius?: number;
  color?: ColorKeyOrString | 666 | 777;
  strokeWidth?: number;
  innerColorStrategy?: ColorAdjustmentStrategy;
  dataLabelPosition?: "top" | "left" | "bottom" | "right";
  dataLabel?: GenericDataLabelStyleOptions;
  annotationGroup?: string;
};

export type GenericPointStyle = {
  show: boolean;
  pointStyle: PointType;
  radius: number;
  color: ColorKeyOrString | 666 | 777;
  strokeWidth: number;
  innerColorStrategy: ColorAdjustmentStrategy;
  dataLabelPosition: "top" | "left" | "bottom" | "right";
  dataLabel: GenericDataLabelStyle;
};

export function getPointStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartValueInfoFunc<
  PointStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
> {
  const cRaw = _c.content?.points?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.points?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.points.func;
  const seriesColorFunc = m(
    _c.seriesColorFunc,
    _g.seriesColorFunc,
    _d.seriesColorFunc,
  );
  const valuesColorFunc = m(
    _c.valuesColorFunc,
    _g.valuesColorFunc,
    _d.valuesColorFunc,
  );
  const cc = _c.content?.dataLabel;
  const gc = _g.content?.dataLabel;
  const dc = _d.content.dataLabel;
  const dShow = m(c?.show, g?.show, d.show);
  const dPointStyle = m(c?.pointStyle, g?.pointStyle, d.pointStyle);
  const dRadius = ms(_sf, c?.radius, g?.radius, d.radius);
  const dColor = m(c?.color, g?.color, d.color);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dInnerColorStrategy = m(
    c?.innerColorStrategy,
    g?.innerColorStrategy,
    d.innerColorStrategy,
  );
  const dDataLabelPosition = m(
    c?.dataLabelPosition,
    g?.dataLabelPosition,
    d.dataLabelPosition,
  );
  const dDataLabel = resolveDataLabelDefaults(
    _sf,
    c?.dataLabel,
    cc,
    g?.dataLabel,
    gc,
    d.dataLabel,
    dc,
  );
  return (
    info: ChartValueInfo,
  ): PointStyle & { dataLabel: DataLabelStyle; annotationGroup?: string } => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const color = oc?.color ?? og?.color ?? dColor;
    const oRadius = oc?.radius ?? og?.radius;
    const oStrokeWidth = oc?.strokeWidth ?? og?.strokeWidth;
    let dl = applyDataLabelOverrides(dDataLabel, og?.dataLabel, _sf);
    dl = applyDataLabelOverrides(dl, oc?.dataLabel, _sf);
    return {
      show: oc?.show ?? og?.show ?? dShow,
      pointStyle: oc?.pointStyle ?? og?.pointStyle ?? dPointStyle,
      radius: oRadius !== undefined ? oRadius * _sf : dRadius,
      color: color === 777
        ? valuesColorFunc(info.val, info.valueMin, info.valueMax)
        : color === 666
        ? seriesColorFunc(info)
        : color,
      strokeWidth: oStrokeWidth !== undefined
        ? oStrokeWidth * _sf
        : dStrokeWidth,
      innerColorStrategy: oc?.innerColorStrategy ?? og?.innerColorStrategy ??
        dInnerColorStrategy,
      dataLabelPosition: oc?.dataLabelPosition ?? og?.dataLabelPosition ??
        dDataLabelPosition,
      dataLabel: dl,
      annotationGroup: oc?.annotationGroup ?? og?.annotationGroup,
    };
  };
}

//////////////////////////////////////////////
//  _______                                 //
// /       \                                //
// $$$$$$$  |  ______    ______    _______  //
// $$ |__$$ | /      \  /      \  /       | //
// $$    $$<  $$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$$$$$$  | /    $$ |$$ |  $$/ $$      \  //
// $$ |__$$ |/$$$$$$$ |$$ |       $$$$$$  | //
// $$    $$/ $$    $$ |$$ |      /     $$/  //
// $$$$$$$/   $$$$$$$/ $$/       $$$$$$$/   //
//                                          //
//////////////////////////////////////////////

export type GenericBarStyleOptions = {
  show?: boolean;
  fillColor?: ColorKeyOrString | 666 | 777;
  dataLabel?: GenericDataLabelStyleOptions;
  annotationGroup?: string;
};

export type GenericBarStyle = {
  show: boolean;
  fillColor: ColorKeyOrString | 666 | 777;
  dataLabel: GenericDataLabelStyle;
};

export function getBarStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartValueInfoFunc<
  RectStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
> {
  const cRaw = _c.content?.bars?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.bars?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.bars.func;
  const seriesColorFunc = m(
    _c.seriesColorFunc,
    _g.seriesColorFunc,
    _d.seriesColorFunc,
  );
  const valuesColorFunc = m(
    _c.valuesColorFunc,
    _g.valuesColorFunc,
    _d.valuesColorFunc,
  );
  const cc = _c.content?.dataLabel;
  const gc = _g.content?.dataLabel;
  const dc = _d.content.dataLabel;
  const dShow = m(c?.show, g?.show, d.show);
  const dColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  const dDataLabel = resolveDataLabelDefaults(
    _sf,
    c?.dataLabel,
    cc,
    g?.dataLabel,
    gc,
    d.dataLabel,
    dc,
  );
  return (
    info: ChartValueInfo,
  ): RectStyle & { dataLabel: DataLabelStyle; annotationGroup?: string } => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const color = oc?.fillColor ?? og?.fillColor ?? dColor;
    let dl = applyDataLabelOverrides(dDataLabel, og?.dataLabel, _sf);
    dl = applyDataLabelOverrides(dl, oc?.dataLabel, _sf);
    return {
      show: oc?.show ?? og?.show ?? dShow,
      fillColor: color === 777
        ? valuesColorFunc(info.val, info.valueMin, info.valueMax)
        : color === 666
        ? seriesColorFunc(info)
        : color,
      dataLabel: dl,
      annotationGroup: oc?.annotationGroup ?? og?.annotationGroup,
    };
  };
}

//////////////////////////////////////////////////
//  __        __                                //
// /  |      /  |                               //
// $$ |      $$/  _______    ______    _______  //
// $$ |      /  |/       \  /      \  /       | //
// $$ |      $$ |$$$$$$$  |/$$$$$$  |/$$$$$$$/  //
// $$ |      $$ |$$ |  $$ |$$    $$ |$$      \  //
// $$ |_____ $$ |$$ |  $$ |$$$$$$$$/  $$$$$$  | //
// $$       |$$ |$$ |  $$ |$$       |/     $$/  //
// $$$$$$$$/ $$/ $$/   $$/  $$$$$$$/ $$$$$$$/   //
//                                              //
//////////////////////////////////////////////////

export type GenericLineStyleOptions = {
  show?: boolean;
  color?: ColorKeyOrString | 666;
  strokeWidth?: number;
  lineDash?: "solid" | "dashed";
  dataLabel?: GenericDataLabelStyleOptions;
  annotationGroup?: string;
};

export type GenericLineStyle = {
  show: boolean;
  color: ColorKeyOrString | 666;
  strokeWidth: number;
  lineDash: "solid" | "dashed";
  dataLabel: GenericDataLabelStyle;
};

export function getLineStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartSeriesInfoFunc<
  LineStyle & { dataLabel: DataLabelStyle; annotationGroup?: string }
> {
  const cRaw = _c.content?.lines?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.lines?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.lines.func;
  const seriesColorFunc = m(
    _c.seriesColorFunc,
    _g.seriesColorFunc,
    _d.seriesColorFunc,
  );
  const cc = _c.content?.dataLabel;
  const gc = _g.content?.dataLabel;
  const dc = _d.content.dataLabel;
  const dShow = m(c?.show, g?.show, d.show);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dColor = m(c?.color, g?.color, d.color);
  const dLineDash = m(c?.lineDash, g?.lineDash, d.lineDash);
  const dDataLabel = resolveDataLabelDefaults(
    _sf,
    c?.dataLabel,
    cc,
    g?.dataLabel,
    gc,
    d.dataLabel,
    dc,
  );
  return (
    info: ChartSeriesInfo,
  ): LineStyle & { dataLabel: DataLabelStyle; annotationGroup?: string } => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const color = oc?.color ?? og?.color ?? dColor;
    const oStrokeWidth = oc?.strokeWidth ?? og?.strokeWidth;
    let dl = applyDataLabelOverrides(dDataLabel, og?.dataLabel, _sf);
    dl = applyDataLabelOverrides(dl, oc?.dataLabel, _sf);
    return {
      show: oc?.show ?? og?.show ?? dShow,
      strokeWidth: oStrokeWidth !== undefined
        ? oStrokeWidth * _sf
        : dStrokeWidth,
      strokeColor: color === 666 ? seriesColorFunc(info) : color,
      lineDash: oc?.lineDash ?? og?.lineDash ?? dLineDash,
      dataLabel: dl,
      annotationGroup: oc?.annotationGroup ?? og?.annotationGroup,
    };
  };
}

////////////////////////////////////////////////////////
//   ______                                           //
//  /      \                                          //
// /$$$$$$  |  ______    ______    ______    _______  //
// $$ |__$$ | /      \  /      \  /      \  /       | //
// $$    $$ |/$$$$$$  |/$$$$$$  | $$$$$$  |/$$$$$$$/  //
// $$$$$$$$ |$$ |  $$/ $$    $$ | /    $$ |$$      \  //
// $$ |  $$ |$$ |      $$$$$$$$/ /$$$$$$$ | $$$$$$  | //
// $$ |  $$ |$$ |      $$       |$$    $$ |/     $$/  //
// $$/   $$/ $$/        $$$$$$$/  $$$$$$$/ $$$$$$$/   //
//                                                    //
////////////////////////////////////////////////////////

export type GenericAreaStyleOptions = {
  show?: boolean;
  to?: "zero-line" | "previous-series-or-zero" | "previous-series-or-skip";
  fillColor?: ColorKeyOrString | 666;
  fillColorAdjustmentStrategy?: ColorAdjustmentStrategy;
  annotationGroup?: string;
};

export type GenericAreaStyle = {
  show: boolean;
  to: "zero-line" | "previous-series-or-zero" | "previous-series-or-skip";
  fillColor: ColorKeyOrString | 666;
  fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
};

export function getAreaStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartSeriesInfoFunc<AreaStyle & { annotationGroup?: string }> {
  const cRaw = _c.content?.areas?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.areas?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.areas.func;
  const seriesColorFunc = m(
    _c.seriesColorFunc,
    _g.seriesColorFunc,
    _d.seriesColorFunc,
  );
  const dShow = m(c?.show, g?.show, d.show);
  const dTo = m(c?.to, g?.to, d.to);
  const dColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  const dColorStrategy = m(
    c?.fillColorAdjustmentStrategy,
    g?.fillColorAdjustmentStrategy,
    d.fillColorAdjustmentStrategy,
  );
  return (
    info: ChartSeriesInfo,
  ): AreaStyle & { annotationGroup?: string } => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const color = oc?.fillColor ?? og?.fillColor ?? dColor;
    return {
      show: oc?.show ?? og?.show ?? dShow,
      to: oc?.to ?? og?.to ?? dTo,
      fillColor: color === 666 ? seriesColorFunc(info) : color,
      fillColorAdjustmentStrategy: oc?.fillColorAdjustmentStrategy ??
        og?.fillColorAdjustmentStrategy ??
        dColorStrategy,
      annotationGroup: oc?.annotationGroup ?? og?.annotationGroup,
    };
  };
}

/////////////////////////////////////////////////////////////////////////////////////
//   ______                                         __                             //
//  /      \                                       /  |                            //
// /$$$$$$  |  ______    _______   _______   ______$$ |  ______                    //
// $$ |  $$/  /      \  /       | /       | /      $$ | /      \                   //
// $$ |      /$$$$$$  |/$$$$$$$/  $$$$$$$/  $$$$$$$$$ |/$$$$$$  |                  //
// $$ |   __ $$ |  $$ |$$      \  $$      \ $$ |  $$ |$$    $$ |                   //
// $$ \__/  |$$ |__$$ | $$$$$$  |  $$$$$$  |$$ \__$$ |$$$$$$$$/                    //
// $$    $$/ $$    $$ |/     $$/ /     $$/ $$    $$ |$$       |                    //
//  $$$$$$/  $$$$$$$/  $$$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/                     //
//           $$ |                                                                  //
//           $$ |                                                                  //
//           $$/                                                                   //
/////////////////////////////////////////////////////////////////////////////////////

export type GenericCascadeArrowStyleOptions = {
  show?: boolean;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  arrowHeadLength?: number;
  showArrowhead?: boolean;
  arrowLengthPctOfSpace?: number;
  arrowLabelGap?: number;
  dataLabel?: GenericDataLabelStyleOptions;
};

export type GenericCascadeArrowStyle = {
  show: boolean;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  arrowHeadLength: number;
  showArrowhead: boolean;
  arrowLengthPctOfSpace: number;
  arrowLabelGap: number;
  dataLabel: GenericDataLabelStyle;
};

export type CascadeArrowStyle = {
  show: boolean;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  arrowHeadLength: number;
  showArrowhead: boolean;
  arrowLengthPctOfSpace: number;
  arrowLabelGap: number;
  dataLabel: DataLabelStyle;
};

export function getCascadeArrowStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): CascadeArrowInfoFunc<CascadeArrowStyle> {
  const cRaw = _c.content?.cascadeArrows?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.cascadeArrows?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.cascadeArrows.func;
  const cc = _c.content?.dataLabel;
  const gc = _g.content?.dataLabel;
  const dc = _d.content.dataLabel;
  const dShow = m(c?.show, g?.show, d.show);
  const dStrokeColor = m(c?.strokeColor, g?.strokeColor, d.strokeColor);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dArrowHeadLength = ms(
    _sf,
    c?.arrowHeadLength,
    g?.arrowHeadLength,
    d.arrowHeadLength,
  );
  const dShowArrowhead = m(c?.showArrowhead, g?.showArrowhead, d.showArrowhead);
  const dArrowLengthPctOfSpace = m(
    c?.arrowLengthPctOfSpace,
    g?.arrowLengthPctOfSpace,
    d.arrowLengthPctOfSpace,
  );
  const dArrowLabelGap = ms(
    _sf,
    c?.arrowLabelGap,
    g?.arrowLabelGap,
    d.arrowLabelGap,
  );
  const dDataLabel = resolveDataLabelDefaults(
    _sf,
    c?.dataLabel,
    cc,
    g?.dataLabel,
    gc,
    d.dataLabel,
    dc,
  );
  return (info: CascadeArrowInfo): CascadeArrowStyle => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const oStrokeWidth = oc?.strokeWidth ?? og?.strokeWidth;
    const oArrowHeadLength = oc?.arrowHeadLength ?? og?.arrowHeadLength;
    const oArrowLabelGap = oc?.arrowLabelGap ?? og?.arrowLabelGap;
    let dl = applyDataLabelOverrides(dDataLabel, og?.dataLabel, _sf);
    dl = applyDataLabelOverrides(dl, oc?.dataLabel, _sf);
    return {
      show: oc?.show ?? og?.show ?? dShow,
      strokeColor: oc?.strokeColor ?? og?.strokeColor ?? dStrokeColor,
      strokeWidth: oStrokeWidth !== undefined
        ? oStrokeWidth * _sf
        : dStrokeWidth,
      arrowHeadLength: oArrowHeadLength !== undefined
        ? oArrowHeadLength * _sf
        : dArrowHeadLength,
      showArrowhead: oc?.showArrowhead ?? og?.showArrowhead ?? dShowArrowhead,
      arrowLengthPctOfSpace: oc?.arrowLengthPctOfSpace ??
        og?.arrowLengthPctOfSpace ??
        dArrowLengthPctOfSpace,
      arrowLabelGap: oArrowLabelGap !== undefined
        ? oArrowLabelGap * _sf
        : dArrowLabelGap,
      dataLabel: dl,
    };
  };
}

//////////////////////////////////////////////////////////////////
//  ________                                                    //
// /        |                                                   //
// $$$$$$$$/  ______    ______    ______    ______              //
// $$ |__    /      \  /      \  /      \  /      \             //
// $$    |  /$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |            //
// $$$$$/   $$ |  $$/ $$ |  $$/ $$ |  $$ |$$ |  $$/             //
// $$ |___  $$ |      $$ |      $$ \__$$ |$$ |                  //
// $$    |  $$ |      $$ |      $$    $$/ $$ |                  //
// $$$$$$$/  $$/       $$/        $$$$$$/  $$/                   //
//                                                              //
//////////////////////////////////////////////////////////////////

export type GenericErrorBarStyleOptions = {
  show?: boolean;
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  capWidthProportion?: number;
};

export type GenericErrorBarStyle = {
  show: boolean;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  capWidthProportion: number;
};

export type ErrorBarStyle = {
  show: boolean;
  strokeColor: ColorKeyOrString;
  strokeWidth: number;
  capWidthProportion: number;
};

export function getErrorBarStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartValueInfoFunc<ErrorBarStyle> {
  const cRaw = _c.content?.errorBars?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.errorBars?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.errorBars.func;
  const dShow = m(c?.show, g?.show, d.show);
  const dStrokeColor = m(c?.strokeColor, g?.strokeColor, d.strokeColor);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dCapWidthProportion = m(
    c?.capWidthProportion,
    g?.capWidthProportion,
    d.capWidthProportion,
  );
  return (info: ChartValueInfo): ErrorBarStyle => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const oStrokeWidth = oc?.strokeWidth ?? og?.strokeWidth;
    return {
      show: oc?.show ?? og?.show ?? dShow,
      strokeColor: oc?.strokeColor ?? og?.strokeColor ?? dStrokeColor,
      strokeWidth: oStrokeWidth !== undefined
        ? oStrokeWidth * _sf
        : dStrokeWidth,
      capWidthProportion: oc?.capWidthProportion ?? og?.capWidthProportion ??
        dCapWidthProportion,
    };
  };
}

///////////////////////////////////////////////////////////////////////////////////
//   ______                     ___   __       __                                //
//  /      \                   /  _| /  |     /  |                               //
// /$$$$$$  |  ______   ____  | |_  $$/   ____$$ |  ______   _______    _______  //
// $$ |  $$/  /      \ /    \ |  _| /  | /    $$ | /      \ /       \  /       | //
// $$ |      /$$$$$$  |$$$$$  | |  $$ |/$$$$$$$ |/$$$$$$  |$$$$$$$  |/$$$$$$$/   //
// $$ |   __ $$ |  $$ |$$ | $$|  _| $$ |$$ |  $$ |$$    $$ |$$ |  $$ |$$      \  //
// $$ \__/  |$$ \__$$ |$$ | $$ | |  $$ |$$ \__$$ |$$$$$$$$/ $$ |  $$ | $$$$$$  | //
// $$    $$/ $$    $$/ $$ | $$ |_|  $$ |$$    $$ |$$       |$$ |  $$ |/     $$/  //
//  $$$$$$/   $$$$$$/  $$/  $$$$/   $$/  $$$$$$$/  $$$$$$$/ $$/   $$/ $$$$$$$/   //
//                                                                               //
///////////////////////////////////////////////////////////////////////////////////

export type GenericConfidenceBandStyleOptions = {
  show?: boolean;
  fillColor?: ColorKeyOrString | 666;
  fillColorAdjustmentStrategy?: ColorAdjustmentStrategy;
};

export type GenericConfidenceBandStyle = {
  show: boolean;
  fillColor: ColorKeyOrString | 666;
  fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
};

export type ConfidenceBandStyle = {
  show: boolean;
  fillColor: ColorKeyOrString;
  fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
};

export function getConfidenceBandStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): ChartSeriesInfoFunc<ConfidenceBandStyle> {
  const cRaw = _c.content?.confidenceBands?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.confidenceBands?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.confidenceBands.func;
  const seriesColorFunc = m(
    _c.seriesColorFunc,
    _g.seriesColorFunc,
    _d.seriesColorFunc,
  );
  const dShow = m(c?.show, g?.show, d.show);
  const dFillColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  const dFillColorAdjustmentStrategy = m(
    c?.fillColorAdjustmentStrategy,
    g?.fillColorAdjustmentStrategy,
    d.fillColorAdjustmentStrategy,
  );
  return (info: ChartSeriesInfo): ConfidenceBandStyle => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const fillColor = oc?.fillColor ?? og?.fillColor ?? dFillColor;
    return {
      show: oc?.show ?? og?.show ?? dShow,
      fillColor: fillColor === 666 ? seriesColorFunc(info) : fillColor,
      fillColorAdjustmentStrategy: oc?.fillColorAdjustmentStrategy ??
        og?.fillColorAdjustmentStrategy ??
        dFillColorAdjustmentStrategy,
    };
  };
}

///////////////////////////////////////////////////////////////////////////
//  __       __                       _______                    __      //
// /  \     /  |                     /       \                  /  |     //
// $$  \   /$$ |  ______   ______   $$$$$$$  |  ______    ____ $$/      //
// $$$  \ /$$$ | /      \ /      \  $$ |__$$ | /      \  /    \/  |     //
// $$$$  /$$$$ | $$$$$$  /$$$$$$  | $$    $$< /$$$$$$  |/$$$$$$$ |      //
// $$ $$ $$/$$ | /    $$ $$ |  $$ | $$$$$$$  |$$    $$ |$$ |  $$ |      //
// $$ |$$$/ $$ |/$$$$$$$ $$ |__$$ | $$ |  $$ |$$$$$$$$/ $$ \__$$ |      //
// $$ | $/  $$ |$$    $$ $$    $$/  $$ |  $$ |$$       |$$    $$ |      //
// $$/      $$/  $$$$$$$/ $$$$$$$/  $$/   $$/  $$$$$$$/  $$$$$$$/       //
//                        $$ |                                          //
//                        $$ |                                          //
//                        $$/                                           //
///////////////////////////////////////////////////////////////////////////

export type GenericMapRegionStyleOptions = {
  show?: boolean;
  fillColor?: ColorKeyOrString | 777 | "none";
  strokeColor?: ColorKeyOrString | "none";
  strokeWidth?: number;
  dataLabel?: GenericDataLabelStyleOptions;
  leaderLineStrokeColor?: ColorKeyOrString;
  leaderLineStrokeWidth?: number;
  leaderLineGap?: number;
  centroidOffset?: { dx: number; dy: number };
};

export type GenericMapRegionStyle = {
  show: boolean;
  fillColor: ColorKeyOrString | 777 | "none";
  strokeColor: ColorKeyOrString | "none";
  strokeWidth: number;
  dataLabel: GenericDataLabelStyle;
  leaderLineStrokeColor: ColorKeyOrString;
  leaderLineStrokeWidth: number;
  leaderLineGap: number;
  centroidOffset?: { dx: number; dy: number };
};

export type MapRegionStyle = {
  show: boolean;
  fillColor: ColorKeyOrString | "none";
  strokeColor: ColorKeyOrString | "none";
  strokeWidth: number;
  dataLabel: DataLabelStyle;
  leaderLineStrokeColor: ColorKeyOrString;
  leaderLineStrokeWidth: number;
  leaderLineGap: number;
  centroidOffset?: { dx: number; dy: number };
};

export function getMapRegionStyleFunc(
  _sf: number,
  _c: CustomFigureStyleOptions,
  _g: CustomFigureStyleOptions,
  _d: DefaultFigureStyle,
): MapRegionInfoFunc<MapRegionStyle> {
  const cRaw = _c.content?.mapRegions?.func;
  const c = typeof cRaw === "object" ? cRaw : undefined;
  const cf = typeof cRaw === "function" ? cRaw : undefined;
  const gRaw = _g.content?.mapRegions?.func;
  const g = typeof gRaw === "object" ? gRaw : undefined;
  const gf = typeof gRaw === "function" ? gRaw : undefined;
  const d = _d.content.mapRegions.func;
  const valuesColorFunc = m(
    _c.valuesColorFunc,
    _g.valuesColorFunc,
    _d.valuesColorFunc,
  );
  const cc = _c.content?.dataLabel;
  const gc = _g.content?.dataLabel;
  const dc = _d.content.dataLabel;
  const dShow = m(c?.show, g?.show, d.show);
  const dFillColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  const dStrokeColor = m(c?.strokeColor, g?.strokeColor, d.strokeColor);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dLeaderLineStrokeColor = m(
    c?.leaderLineStrokeColor,
    g?.leaderLineStrokeColor,
    d.leaderLineStrokeColor,
  );
  const dLeaderLineStrokeWidth = ms(
    _sf,
    c?.leaderLineStrokeWidth,
    g?.leaderLineStrokeWidth,
    d.leaderLineStrokeWidth,
  );
  const dLeaderLineGap = ms(
    _sf,
    c?.leaderLineGap,
    g?.leaderLineGap,
    d.leaderLineGap,
  );
  const dCentroidOffset = m(
    c?.centroidOffset,
    g?.centroidOffset,
    d.centroidOffset,
  );
  const dDataLabel = resolveDataLabelDefaults(
    _sf,
    c?.dataLabel,
    cc,
    g?.dataLabel,
    gc,
    d.dataLabel,
    dc,
  );

  return (info: MapRegionInfo): MapRegionStyle => {
    const oc = cf?.(info);
    const og = gf?.(info);
    const fillColor = oc?.fillColor ?? og?.fillColor ?? dFillColor;
    const strokeColor = oc?.strokeColor ?? og?.strokeColor ?? dStrokeColor;
    const oStrokeWidth = oc?.strokeWidth ?? og?.strokeWidth;
    const oLeaderLineStrokeWidth = oc?.leaderLineStrokeWidth ??
      og?.leaderLineStrokeWidth;
    const oLeaderLineGap = oc?.leaderLineGap ?? og?.leaderLineGap;
    let dl = dDataLabel;
    dl = applyDataLabelOverrides(dl, og?.dataLabel, _sf);
    dl = applyDataLabelOverrides(dl, oc?.dataLabel, _sf);
    return {
      show: oc?.show ?? og?.show ?? dShow,
      fillColor: fillColor === 777
        ? valuesColorFunc(info.value, info.valueMin, info.valueMax)
        : fillColor,
      strokeColor: strokeColor,
      strokeWidth: oStrokeWidth !== undefined
        ? oStrokeWidth * _sf
        : dStrokeWidth,
      dataLabel: dl,
      leaderLineStrokeColor: oc?.leaderLineStrokeColor ??
        og?.leaderLineStrokeColor ??
        dLeaderLineStrokeColor,
      leaderLineStrokeWidth: oLeaderLineStrokeWidth !== undefined
        ? oLeaderLineStrokeWidth * _sf
        : dLeaderLineStrokeWidth,
      leaderLineGap: oLeaderLineGap !== undefined
        ? oLeaderLineGap * _sf
        : dLeaderLineGap,
      centroidOffset: oc?.centroidOffset ?? og?.centroidOffset ??
        dCentroidOffset,
    };
  };
}
