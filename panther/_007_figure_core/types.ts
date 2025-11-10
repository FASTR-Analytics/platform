// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomFigureStyleOptions, RectCoordsDims } from "./deps.ts";
import type { LegendItem } from "./_legend/types.ts";

export type JsonArrayItem = {
  [key: string]: string | number | undefined | null;
};

export type JsonArray = JsonArrayItem[];

export type FigureInputsBase = {
  caption?: string | undefined;
  subCaption?: string | undefined;
  footnote?: string | string[] | undefined;
  legendItemsOrLabels?: LegendItem[] | string[] | undefined;
  style?: CustomFigureStyleOptions | undefined;
};

export type YScaleAxisData = {
  tierHeaders: string[];
  paneLimits: {
    tierLimits: { valueMin: number; valueMax: number }[];
    valueMin: number;
    valueMax: number;
  }[];
  yScaleAxisLabel?: string;
};

export type YScaleAxisWidthInfo = {
  yAxisTickValues: number[][];
  widthIncludingYAxisStrokeWidth: number;
  tierHeaderAndLabelGapWidth: number;
  halfYAxisTickLabelH: number;
  guessMaxNTicks: number;
};

export type LaneHeadersData = {
  laneHeaders: string[];
  rcd: RectCoordsDims;
  subChartAreaWidth: number;
  lanePaddingLeft: number;
  laneGapX: number;
};

// Re-export LegendItem for convenience
export type { LegendItem };
