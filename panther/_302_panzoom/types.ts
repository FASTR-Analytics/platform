// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Pt, Rect } from "./deps.ts";

export type Camera = { x: number; y: number; scale: number };

export type PanZoomApi = {
  fit: () => void;
  panTo: (contentPt: Pt) => void;
  toContent: (screenPt: Pt) => Pt;
};

// The visible region of content space, plus the current scale (the LOD /
// stroke-compensation input). A canvas host paints only what intersects this.
export type CanvasView = Rect & { scale: number };
