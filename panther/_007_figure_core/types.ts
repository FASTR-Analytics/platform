// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CustomFigureStyleOptions,
  PaddingOptions,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { LegendItem } from "./_legend/types.ts";
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
  caption?: string | undefined;
  subCaption?: string | undefined;
  footnote?: string | string[] | undefined;
  legend?: LegendInput | undefined;
  style?: CustomFigureStyleOptions | undefined;
  autofit?: boolean | FigureAutofitOptions;
  // When shrink-to-fit shrinks a figure, surrounds (caption/subCaption/footnote
  // text + their padding/gaps) stay at full size by default while the body
  // scales. Set true to make them shrink with the body. The legend always
  // scales with the body, regardless of this flag.
  autofitSurrounds?: boolean;
  annotations?: FigureAnnotation[];
};

export type ChartScaleAxisLimitsEntry = {
  valueMin: number;
  valueMax: number;
};

export type ChartScaleAxisPaneLimits = ChartScaleAxisLimitsEntry & {
  tierLimits: ChartScaleAxisLimitsEntry[];
  laneLimits: ChartScaleAxisLimitsEntry[];
};

export type ChartScaleAxisLimits = {
  paneLimits: ChartScaleAxisPaneLimits[];
};

export type YAxisWidthInfoBase = {
  widthIncludingYAxisStrokeWidth: number;
  halfYAxisTickLabelH: number;
};

export type XAxisHeightInfoBase = {
  heightIncludingXAxisStrokeWidth: number;
};

export type YScaleAxisWidthInfo = YAxisWidthInfoBase & {
  yAxisTickValues: number[][];
  tierHeaderAndLabelGapWidth: number;
  guessMaxNTicks: number;
  tickLabelFormatter: (v: number) => string;
};

export type YNoneAxisWidthInfo = YAxisWidthInfoBase;
export type YAxisWidthInfo =
  | YScaleAxisWidthInfo
  | YTextAxisWidthInfo
  | YNoneAxisWidthInfo;

export type ValueRange = { minVal: number; maxVal: number };

// Inset applied to a scale axis's value range WITHIN the plot area, so
// elements centered on the extreme ticks (tick labels, data labels) stay
// inside the plot rect. The plot rect itself never changes — only the
// value-to-coordinate mapping. start = 0% end (x: left, y: bottom),
// end = 100% end (x: right, y: top).
export type OverhangClearance = {
  start: number;
  end: number;
};

export const NO_OVERHANG_CLEARANCE: OverhangClearance = { start: 0, end: 0 };

// Never let clearance consume more than this fraction of the plot extent
// per side (pathologically small plots / huge labels).
const MAX_OVERHANG_CLEARANCE_FRACTION = 0.4;

export function clampOverhangClearance(
  clearance: OverhangClearance,
  plotExtent: number,
): OverhangClearance {
  const maxPerSide = Math.max(0, plotExtent * MAX_OVERHANG_CLEARANCE_FRACTION);
  return {
    start: Math.max(0, Math.min(clearance.start, maxPerSide)),
    end: Math.max(0, Math.min(clearance.end, maxPerSide)),
  };
}

export interface TransformedDataBase {
  seriesHeaders: string[];
  laneHeaders: string[];
  tierHeaders: string[];
  paneHeaders: string[];
}

export type UncertaintyConfig =
  | {
    uncertaintyProp: string;
    peValue: string;
    ubValue: string;
    lbValue: string;
  }
  | {
    ubValueProps: string[];
    lbValueProps: string[];
  };

export function isRowBasedUncertainty(
  u: UncertaintyConfig,
): u is {
  uncertaintyProp: string;
  peValue: string;
  ubValue: string;
  lbValue: string;
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

export type { LegendItem };
