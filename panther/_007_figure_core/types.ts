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
import type { YTextAxisWidthInfo } from "./_axes/y_text/types.ts";
export type { YTextAxisWidthInfo };

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

export type YNoneAxisWidthInfo = YAxisWidthInfoBase;
export type YAxisWidthInfo =
  | YValueAxisWidthInfo
  | YTextAxisWidthInfo
  | YNoneAxisWidthInfo;

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

export const NO_OVERHANG_CLEARANCE: OverhangClearance = { start: 0, end: 0 };

// Never let clearance consume more than this fraction of the value axis extent
// per side (pathologically small plots / huge labels).
const MAX_OVERHANG_CLEARANCE_FRACTION = 0.4;

export function clampOverhangClearance(
  clearance: OverhangClearance,
  valueAxisExtent: number,
): OverhangClearance {
  const maxPerSide = Math.max(
    0,
    valueAxisExtent * MAX_OVERHANG_CLEARANCE_FRACTION,
  );
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

export function validateUncertaintyConfig(
  uncertainty: UncertaintyConfig,
  valueProps: string[],
  dimensionProps: (string | undefined)[],
): void {
  if (isRowBasedUncertainty(uncertainty)) {
    for (const prop of dimensionProps) {
      if (prop && prop !== "--v" && prop === uncertainty.uncertaintyProp) {
        throw new Error(
          `uncertaintyProp "${uncertainty.uncertaintyProp}" overlaps with dimension prop "${prop}"`,
        );
      }
    }
  } else {
    if (uncertainty.ubValueProps.length !== valueProps.length) {
      throw new Error(
        `ubValueProps length (${uncertainty.ubValueProps.length}) must equal valueProps length (${valueProps.length})`,
      );
    }
    if (uncertainty.lbValueProps.length !== valueProps.length) {
      throw new Error(
        `lbValueProps length (${uncertainty.lbValueProps.length}) must equal valueProps length (${valueProps.length})`,
      );
    }
  }
}

export type { LegendEntry };
