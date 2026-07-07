// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./deps.ts";

// Per-edge style callback for vizgraph figures (the *InfoFunc pattern, cf.
// chart_info_types.ts). Resolved by the figure adapter BEFORE layout: the
// returned thickness becomes engine-side occupancy; color/dash stay
// renderer-side. Precedence: per-edge data > this callback > global style.
export type VizGraphEdgeInfo = {
  id: string;
  from: string;
  to: string;
  weight?: number;
};

export type VizGraphEdgeStyleOptions = {
  thickness?: number;
  strokeColor?: ColorKeyOrString;
  lineDash?: "solid" | "dashed";
};

export type VizGraphEdgeInfoFunc = (
  info: VizGraphEdgeInfo,
) => VizGraphEdgeStyleOptions;
