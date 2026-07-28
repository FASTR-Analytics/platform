// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Geometry } from "./types_geometry.ts";

export type LayoutOptions = {
  orientation?: "left-right" | "top-bottom";
  spacing?: Partial<Spacing>;
  ranking?: "given" | "longest-path" | "auto";
  coordinateMode?: "budge" | "brandes-koepf";
  routing?: "orthogonal" | "polyline";
  cornerRadius?: number;
  fit?: { width: number };
  measureNode?: NodeMeasurer;
  prior?: Geometry;
};

// The EXACT size of an unsized node at a width budget, wrapping included:
// returned w ≤ maxWidth is the tight wrapped bounding box (text forced onto
// two lines snaps the node to the widest line — never the budget with
// slack). The engine derives each node's min/ideal width by probing
// (maxWidth ≈ 0 / ∞) and adopts returned sizes as authoritative. MUST be
// pure: layout() determinism extends over it. Sizes include borders (the
// full outer box).
export type NodeMeasurer = (
  nodeId: string,
  maxWidth: number,
) => { w: number; h: number };

// ideal = the uncramped value; min = the floor under fit pressure. There is
// deliberately no way to stretch beyond ideal (panther-wide: scale down,
// never up) and no separate on/off switch — min == ideal (or a bare number)
// IS off.
export type GapRange = { min: number; ideal: number };

// layerGap is pressure-responsive (gaps-first, PLAN M4-polish 7): under
// fit.width pressure it compresses ideal→min BEFORE any node text rewraps.
// A bare number means fixed (exact pre-range behavior).
//
// portGap is pressure-responsive too, against SIDE-LENGTH pressure: a
// left/right port fan spreads at ideal, compresses ideal→min when the side
// is too short, and past min the NODE GROWS just enough to restore min (the
// port-gap floor, DOC_VIZGRAPH_ROUTING.md). The value is DAYLIGHT between
// strokes — pitch adds the side's max edge thickness — so a negative min
// permits bounded stroke overlap, and a very negative min never grows
// (unbounded compression). A bare number means fixed (min == ideal): never
// compress, always grow to the full gap. Top/bottom fans (immediate edges)
// compress freely regardless — the floor governs only the horizontal
// segments joining left/right sides.
export type Spacing = {
  nodeGap: number;
  layerGap: number | GapRange;
  laneGap: number;
  trackGap: number;
  portGap: number | GapRange;
  portMargin: number;
  // Inset between a group's box and its member nodes (M6); the box also
  // reserves the group label's height above its first member.
  groupPad: number;
};

// Engine-internal: layerGap/portGap resolved to the effective number for the
// current pressure state (stage [3½] lowers layerGap within layerGapRange;
// portGap resolves to its ideal — the floor is read from portGapRange by the
// port-gap floor and by assignPorts' compression).
export type ResolvedSpacing = Omit<Spacing, "layerGap" | "portGap"> & {
  layerGap: number;
  layerGapRange: GapRange;
  portGap: number;
  portGapRange: GapRange;
};

export const DEFAULT_SPACING: Spacing = {
  nodeGap: 24,
  layerGap: { min: 32, ideal: 80 },
  laneGap: 40,
  trackGap: 12,
  portGap: { min: 1, ideal: 16 },
  portMargin: 8,
  groupPad: 8,
};

export function resolveSpacing(
  input: Partial<Spacing> | undefined,
): ResolvedSpacing {
  const merged = { ...DEFAULT_SPACING, ...input };
  const lg = merged.layerGap;
  const layerGapRange = typeof lg === "number" ? { min: lg, ideal: lg } : lg;
  const pg = merged.portGap;
  const portGapRange = typeof pg === "number" ? { min: pg, ideal: pg } : pg;
  return {
    ...merged,
    layerGap: layerGapRange.ideal,
    layerGapRange,
    portGap: portGapRange.ideal,
    portGapRange,
  };
}
