// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomFigureStyleOptions } from "./deps.ts";
import type { LegendItem } from "./_legend/types.ts";
import type { YTextAxisWidthInfo } from "./_axes/y_text/types.ts";
export type { YTextAxisWidthInfo };

export type JsonArrayItem = {
  [key: string]: string | number | undefined | null;
};

export type JsonArray = JsonArrayItem[];

export type FigureAutofitOptions = {
  minScale?: number;
  maxScale?: number;
};

export type FigureInputsBase = {
  caption?: string | undefined;
  subCaption?: string | undefined;
  footnote?: string | string[] | undefined;
  legendItemsOrLabels?: LegendItem[] | string[] | undefined;
  style?: CustomFigureStyleOptions | undefined;
  autofit?: boolean | FigureAutofitOptions;
};

export type YScaleAxisData = {
  paneLimits: {
    tierLimits: { valueMin: number; valueMax: number }[];
    valueMin: number;
    valueMax: number;
  }[];
  yScaleAxisLabel?: string;
};

export type YAxisWidthInfoBase = {
  widthIncludingYAxisStrokeWidth: number;
  halfYAxisTickLabelH: number;
};

export type YScaleAxisWidthInfo = YAxisWidthInfoBase & {
  yAxisTickValues: number[][];
  tierHeaderAndLabelGapWidth: number;
  guessMaxNTicks: number;
};

export type YAxisWidthInfo = YScaleAxisWidthInfo | YTextAxisWidthInfo;

export type ValueRange = { minVal: number; maxVal: number };

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
