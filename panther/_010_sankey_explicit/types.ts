// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyle,
  FigureInputsBase,
  Measured,
  MeasuredSurrounds,
  Primitive,
} from "./deps.ts";

export type ExplicitSankeyNode = {
  id: string;
  label?: string;
  color: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ExplicitSankeyLink = {
  from: string;
  to: string;
  fromY: number;
  toY: number;
  height: number;
  color: string;
};

export type SankeyExplicitInputs = FigureInputsBase & {
  nodes: ExplicitSankeyNode[];
  links: ExplicitSankeyLink[];
};

export type MeasuredSankeyExplicit = Measured<SankeyExplicitInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  primitives: Primitive[];
};
