// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  CustomFigureStyle,
  FigureInputsBase,
  Measured,
  MeasuredSurrounds,
  MergedSankeyStyle,
  Primitive,
} from "./deps.ts";

export type { MergedSankeyStyle };

export type SankeyInputs = FigureInputsBase & {
  sankeyData: SankeyData;
};

export type SankeyData = {
  nodes: SankeyNode[];
  links: SankeyLink[];
};

export type SankeyNode = {
  id: string;
  label?: string;
  color?: ColorKeyOrString;
  column?: number;
};

export type SankeyLink = {
  from: string;
  to: string;
  value: number;
  color?: ColorKeyOrString;
};

export type MeasuredSankey = Measured<SankeyInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  primitives: Primitive[];
};

export type PositionedNode = {
  id: string;
  label?: string;
  color: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  totalValue: number;
};

export type PositionedLink = {
  from: string;
  to: string;
  value: number;
  color: string;
  fromY: number;
  toY: number;
  height: number;
};
