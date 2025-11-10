// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AreaStyle,
  ColorAdjustmentStrategy,
  ColorKeyOrString,
  LineStyle,
  PointStyle,
  PointType,
  RectStyle,
} from "./deps.ts";
import { m, ms } from "./helpers.ts";

//////////////////////////////////////////////////////////////////////
//   ______                                           __            //
//  /      \                                         /  |           //
// /$$$$$$  |  ______   _______    ______    ______  $$/   _______  //
// $$ | _$$/  /      \ /       \  /      \  /      \ /  | /       | //
// $$ |/    |/$$$$$$  |$$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |/$$$$$$$/  //
// $$ |$$$$ |$$    $$ |$$ |  $$ |$$    $$ |$$ |  $$/ $$ |$$ |       //
// $$ \__$$ |$$$$$$$$/ $$ |  $$ |$$$$$$$$/ $$ |      $$ |$$ \_____  //
// $$    $$/ $$       |$$ |  $$ |$$       |$$ |      $$ |$$       | //
//  $$$$$$/   $$$$$$$/ $$/   $$/  $$$$$$$/ $$/       $$/  $$$$$$$/  //
//                                                                  //
//////////////////////////////////////////////////////////////////////

export type GenericSeriesInfo = {
  i_series: number;
  seriesHeader: string;
  nSerieses: number;
  seriesValArrays: (number | undefined)[][];
  nVals: number;
  //
  i_pane: number;
  nPanes: number;
  i_tier: number;
  nTiers: number;
  i_lane: number;
  nLanes: number;
};

export type GenericSeriesInfoFunc<T> = (info: GenericSeriesInfo) => T;

export type GenericValueInfo = GenericSeriesInfo & {
  val: number | undefined;
  i_val: number;
};

export type GenericValueInfoFunc<T> = (info: GenericValueInfo) => T;

export type TableCellFormatterFunc<
  T extends string | number | null | undefined,
  R,
> = (
  value: T,
  cell: {
    rowIndex: number;
    rowHeader: string | "none";
    colIndex: number;
    colHeader: string | "none";
  },
  mappedSeries?: (
    | {
      val: number;
    }
    | undefined
  )[][],
) => R;

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
  color?: ColorKeyOrString | 666;
  strokeWidth?: number;
  innerColorStrategy?: ColorAdjustmentStrategy;
  dataLabelPosition?: "top" | "left" | "bottom" | "right";
};

export type GenericPointStyle = {
  show: boolean;
  pointStyle: PointType;
  radius: number;
  color: ColorKeyOrString | 666;
  strokeWidth: number;
  innerColorStrategy: ColorAdjustmentStrategy;
  dataLabelPosition: "top" | "left" | "bottom" | "right";
};

export function getPointStyleFunc(
  func: GenericValueInfoFunc<GenericPointStyleOptions> | "none",
  _sf: number,
  c: GenericPointStyleOptions | undefined,
  g: GenericPointStyleOptions | undefined,
  d: GenericPointStyle,
  seriesColorFunc: GenericSeriesInfoFunc<ColorKeyOrString>,
): GenericValueInfoFunc<PointStyle> {
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
  return (info: GenericValueInfo): PointStyle => {
    const pointStyleOptions = func === "none"
      ? ({} as GenericPointStyleOptions)
      : func(info);
    const color = pointStyleOptions.color ?? dColor;
    return {
      show: pointStyleOptions.show ?? dShow,
      pointStyle: pointStyleOptions.pointStyle ?? dPointStyle,
      radius: pointStyleOptions.radius !== undefined
        ? pointStyleOptions.radius * _sf
        : dRadius,
      color: color === 666 ? seriesColorFunc(info) : color,
      strokeWidth: pointStyleOptions.strokeWidth !== undefined
        ? pointStyleOptions.strokeWidth * _sf
        : dStrokeWidth,
      innerColorStrategy: pointStyleOptions.innerColorStrategy ??
        dInnerColorStrategy,
      dataLabelPosition: pointStyleOptions.dataLabelPosition ??
        dDataLabelPosition,
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
  fillColor?: ColorKeyOrString | 666;
};

export type GenericBarStyle = {
  show: boolean;
  fillColor: ColorKeyOrString | 666;
};

export function getBarStyleFunc(
  func: GenericValueInfoFunc<GenericBarStyleOptions> | "none",
  _sf: number,
  c: GenericBarStyleOptions | undefined,
  g: GenericBarStyleOptions | undefined,
  d: GenericBarStyle,
  seriesColorFunc: GenericSeriesInfoFunc<ColorKeyOrString>,
): GenericValueInfoFunc<RectStyle> {
  const dShow = m(c?.show, g?.show, d.show);
  const dColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  return (info: GenericValueInfo): RectStyle => {
    const barStyleOptions = func === "none"
      ? ({} as GenericBarStyleOptions)
      : func(info);
    const color = barStyleOptions.fillColor ?? dColor;
    return {
      show: barStyleOptions.show ?? dShow,
      fillColor: color === 666 ? seriesColorFunc(info) : color,
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
};

export type GenericLineStyle = {
  show: boolean;
  color: ColorKeyOrString | 666;
  strokeWidth: number;
  lineDash: "solid" | "dashed";
};

export function getLineStyleFunc(
  func: GenericSeriesInfoFunc<GenericLineStyleOptions> | "none",
  _sf: number,
  c: GenericLineStyleOptions | undefined,
  g: GenericLineStyleOptions | undefined,
  d: GenericLineStyle,
  seriesColorFunc: GenericSeriesInfoFunc<ColorKeyOrString>,
): GenericSeriesInfoFunc<LineStyle> {
  const dShow = m(c?.show, g?.show, d.show);
  const dStrokeWidth = ms(_sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth);
  const dColor = m(c?.color, g?.color, d.color);
  const dLineDash = m(c?.lineDash, g?.lineDash, d.lineDash);
  return (info: GenericSeriesInfo): LineStyle => {
    const lineStyleOptions = func === "none" ? {} : func(info);
    const color = lineStyleOptions.color ?? dColor;
    return {
      show: lineStyleOptions.show ?? dShow,
      strokeWidth: lineStyleOptions.strokeWidth !== undefined
        ? lineStyleOptions.strokeWidth * _sf
        : dStrokeWidth,
      strokeColor: color === 666 ? seriesColorFunc(info) : color,
      lineDash: lineStyleOptions.lineDash ?? dLineDash,
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
};

export type GenericAreaStyle = {
  show: boolean;
  to: "zero-line" | "previous-series-or-zero" | "previous-series-or-skip";
  fillColor: ColorKeyOrString | 666;
  fillColorAdjustmentStrategy: ColorAdjustmentStrategy;
};

export function getAreaStyleFunc(
  func: GenericSeriesInfoFunc<GenericAreaStyleOptions> | "none",
  _sf: number,
  c: GenericAreaStyleOptions | undefined,
  g: GenericAreaStyleOptions | undefined,
  d: GenericAreaStyle,
  seriesColorFunc: GenericSeriesInfoFunc<ColorKeyOrString>,
): GenericSeriesInfoFunc<AreaStyle> {
  const dShow = m(c?.show, g?.show, d.show);
  const dTo = m(c?.to, g?.to, d.to);
  const dColor = m(c?.fillColor, g?.fillColor, d.fillColor);
  return (info: GenericSeriesInfo): AreaStyle => {
    const areaStyleOptions = func === "none" ? {} : func(info);
    const color = areaStyleOptions.fillColor ?? dColor;
    const dColorStrategy = m(
      c?.fillColorAdjustmentStrategy,
      g?.fillColorAdjustmentStrategy,
      d.fillColorAdjustmentStrategy,
    );
    return {
      show: areaStyleOptions.show ?? dShow,
      to: areaStyleOptions.to ?? dTo,
      fillColor: color === 666 ? seriesColorFunc(info) : color,
      fillColorAdjustmentStrategy:
        areaStyleOptions.fillColorAdjustmentStrategy ?? dColorStrategy,
    };
  };
}
