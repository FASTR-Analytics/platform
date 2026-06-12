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

export type SankeyExplicitNode = {
  id: string;
  label?: string;
  color: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SankeyExplicitLink = {
  from: string;
  to: string;
  fromY: number;
  toY: number;
  height: number;
  color: string;
};

export type SankeyExplicitInputs = FigureInputsBase & {
  nodes: SankeyExplicitNode[];
  links: SankeyExplicitLink[];
};

export type MeasuredSankeyExplicit = Measured<SankeyExplicitInputs> & {
  measuredSurrounds: MeasuredSurrounds;
  extraHeightDueToSurrounds: number;
  customFigureStyle: CustomFigureStyle;
  primitives: Primitive[];
};
