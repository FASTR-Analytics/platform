// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

type Not<T> = {
  [P in keyof T]?: void;
};

export type CoordsOffset =
  | (
    & {
      left?: number;
      top?: number;
    }
    & Not<{
      right: number;
      bottom: number;
    }>
  )
  | (
    & {
      left?: number;
      bottom?: number;
    }
    & Not<{
      right: number;
      top: number;
    }>
  )
  | (
    & {
      right?: number;
      top?: number;
    }
    & Not<{
      left: number;
      bottom: number;
    }>
  )
  | (
    & {
      right?: number;
      bottom?: number;
    }
    & Not<{
      left: number;
      top: number;
    }>
  );

// The canonical plain geometry data types. Class-based Coordinates /
// RectCoordsDims serve the figure pipeline; these serve plain-data contracts
// (engine geometry, cameras). _009_vizgraph defines structurally identical
// local copies per its no-imports charter and does not re-export them.
export type Pt = { x: number; y: number };

export type Rect = { x: number; y: number; w: number; h: number };
