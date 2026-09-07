// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { REdge } from "./route_shared.ts";
import { SELF_LOOP_PORT_FRACTION } from "./route_shared.ts";

// Step 6.1 — classification: every model edge becomes an REdge in the 6-way
// taxonomy (forward/backward through gutters; same-layer edges as self,
// immediate, or around), with its gutter list and initial port sides.
export const classifyStep: PipelineStep = {
  id: "6.1",
  name: "classify",
  run: (state) => {
    state.route = { redges: classifyEdges(state.proper!) };
  },
};

export function classifyEdges(proper: ProperGraph): REdge[] {
  const redges: REdge[] = [];
  for (const edge of proper.crossLayerEdges) {
    const from = proper.pnodeByRealId.get(edge.from)!;
    const to = proper.pnodeByRealId.get(edge.to)!;
    const forward = from.layerIndex < to.layerIndex;
    const gutters: number[] = [];
    if (forward) {
      for (let g = from.layerIndex + 1; g <= to.layerIndex; g++) {
        gutters.push(g);
      }
    } else {
      for (let g = from.layerIndex; g >= to.layerIndex + 1; g--) {
        gutters.push(g);
      }
    }
    redges.push({
      edge,
      kind: forward ? "forward" : "backward",
      from,
      to,
      chain: proper.chainByEdgeId.get(edge.id) ?? [],
      gutters,
      trackIdx: gutters.map(() => -1),
      fromPort: { side: forward ? "right" : "left", offset: 0 },
      toPort: { side: forward ? "left" : "right", offset: 0 },
      fromPortY: 0,
      toPortY: 0,
    });
  }
  for (const edge of proper.sameLayerEdges) {
    const from = proper.pnodeByRealId.get(edge.from)!;
    const to = proper.pnodeByRealId.get(edge.to)!;
    if (from === to) {
      redges.push({
        edge,
        kind: "self",
        from,
        to,
        chain: [],
        gutters: [],
        trackIdx: [],
        fromPort: { side: "right", offset: from.h * SELF_LOOP_PORT_FRACTION },
        toPort: {
          side: "right",
          offset: to.h * (1 - SELF_LOOP_PORT_FRACTION),
        },
        fromPortY: 0,
        toPortY: 0,
      });
      continue;
    }
    const adjacent = Math.abs(from.order - to.order) === 1;
    if (adjacent) {
      const downward = from.order < to.order;
      redges.push({
        edge,
        kind: "immediate",
        from,
        to,
        chain: [],
        gutters: [],
        trackIdx: [-1],
        fromPort: { side: downward ? "bottom" : "top", offset: 0 },
        toPort: { side: downward ? "top" : "bottom", offset: 0 },
        fromPortY: 0,
        toPortY: 0,
      });
    } else {
      redges.push({
        edge,
        kind: "around",
        from,
        to,
        chain: [],
        gutters: [from.layerIndex],
        trackIdx: [-1],
        fromPort: { side: "left", offset: 0 },
        toPort: { side: "left", offset: 0 },
        fromPortY: 0,
        toPortY: 0,
      });
    }
  }
  return redges;
}
