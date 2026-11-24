// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CustomFigureStyleOptions,
  PaddingOptions,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { LegendEntry } from "./_legend/types.ts";
import type { LegendInput } from "./_legend/scale_legend_types.ts";

export type JsonArrayItem = {
  [key: string]: string | number | undefined | null;
};

export type JsonArray = JsonArrayItem[];

export type FigureAutofitOptions = {
  minScale?: number;
  maxScale?: number;
  minFontSizeDu?: number;
};

export type FigureAnnotation = {
  group: string;
  rect?: AnnotationRectStyle;
};

export type AnnotationRectTextPlacement = "above" | "below" | "center";

export type AnnotationRectStyle = {
  strokeColor?: ColorKeyOrString;
  strokeWidth?: number;
  padding?: PaddingOptions;
  rectRadius?: number;
  fillColor?: ColorKeyOrString;
  text?: string;
  textPlacement?: AnnotationRectTextPlacement;
  textStyle?: TextInfoUnkeyed;
};

export type FigureInputsBase = {
  title?: string | undefined;
  subtitle?: string | undefined;
  footnote?: string | string[] | undefined;
  legend?: LegendInput | undefined;
  style?: CustomFigureStyleOptions | undefined;
  autofit?: boolean | FigureAutofitOptions;
  // When shrink-to-fit shrinks a figure, surrounds (title/subtitle/footnote
  // text + their padding/gaps) stay at full size by default while the body
  // scales. Set true to make them shrink with the body. The legend always
  // scales with the body, regardless of this flag.
  autofitSurrounds?: boolean;
  annotations?: FigureAnnotation[];
};

export type ChartValueAxisLimitsEntry = {
  valueMin: number;
  valueMax: number;
};

export type ChartValueAxisPaneLimits = ChartValueAxisLimitsEntry & {
  tierLimits: ChartValueAxisLimitsEntry[];
  laneLimits: ChartValueAxisLimitsEntry[];
};

export type ChartValueAxisLimits = {
  paneLimits: ChartValueAxisPaneLimits[];
};

export type YAxisWidthInfoBase = {
  widthIncludingYAxisStrokeWidth: number;
  halfYAxisTickLabelH: number;
};

export type XAxisHeightInfoBase = {
  heightIncludingXAxisStrokeWidth: number;
};

export type YValueAxisWidthInfo = YAxisWidthInfoBase & {
  yAxisTickValues: number[][];
  tierHeaderAndLabelGapWidth: number;
  tickLabelFormatter: (v: number) => string;
};

export type ValueRange = { valueMin: number; valueMax: number };

// Inset applied to a value axis's value range WITHIN the sub-chart, so
// elements centered on the extreme ticks (tick labels, data labels) stay
// inside the sub-chart rect. The sub-chart rect itself never changes — only the
// value-to-coordinate mapping. start = 0% end (x: left, y: bottom),
// end = 100% end (x: right, y: top).
export type OverhangClearance = {
  start: number;
  end: number;
};

export function clampOverhangClearance(
  clearance: OverhangClearance,
  valueAxisExtent: number,
  maxFractionOfExtent: number,
): OverhangClearance {
  const maxPerSide = Math.max(0, valueAxisExtent * maxFractionOfExtent);
  return {
    start: Math.max(0, Math.min(clearance.start, maxPerSide)),
    end: Math.max(0, Math.min(clearance.end, maxPerSide)),
  };
}

export type UncertaintyConfig =
  | {
    uncertaintyProp: string;
    peMemberId: string;
    ubMemberId: string;
    lbMemberId: string;
  }
  | {
    ubValueProps: string[];
    lbValueProps: string[];
  };

export function isRowBasedUncertainty(
  u: UncertaintyConfig,
): u is {
  uncertaintyProp: string;
  peMemberId: string;
  ubMemberId: string;
  lbMemberId: string;
} {
  return "uncertaintyProp" in u;
}

export type { LegendEntry };
