// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type PositionedSankeyNode = {
  id: string;
  label?: string;
  color: string;
  column: number;
  x: number;
  y: number;
  width: number;
  height: number;
  totalValue: number;
  row?: number;
  rowStart?: number;
  rowEnd?: number;
};

export type PositionedSankeyLink = {
  from: string;
  to: string;
  value: number;
  color: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  height: number;
};

export type SankeyPrimitiveOptions = {
  labelGap: number;
  linkOpacity: number;
};
