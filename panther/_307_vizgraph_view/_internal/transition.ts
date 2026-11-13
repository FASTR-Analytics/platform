// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { tween } from "../deps.ts";
import type { Geometry, PhaseProgress } from "../deps.ts";

// Opacity keys are namespaced ("n:" / "e:") — node and edge id spaces are
// independent, so a shared raw-id record could cross-talk.
export type TransitionFrame = {
  geometry: Geometry;
  opacities: Record<string, number> | undefined;
  // Group rings + headers fade as ONE layer: the hug outline is not in the
  // tween contract, so the departing geometry's rings fade out over the exit
  // and the settled geometry's rings fade in with the newcomers (a ring
  // re-derivation per frame is not cheap; snapping looks broken).
  groupOpacity: number;
};

export function nodeOpacityKey(id: string): string {
  return `n:${id}`;
}

export function edgeOpacityKey(id: string): string {
  return `e:${id}`;
}

// The geometry between `from` and `to` at the transition's phase progress
// (DOC_VIZGRAPH_ARCHITECTURE.md): removed nodes and edges fade out over the
// exit, survivors move over the move, newcomers fade in at their destination
// over the enter. Matched edges are tweened pairwise by the engine.
export function buildTransitionFrame(
  from: Geometry,
  to: Geometry,
  ph: PhaseProgress,
): TransitionFrame {
  if (ph.exit <= 0 && ph.move <= 0 && ph.enter <= 0) {
    return { geometry: from, opacities: undefined, groupOpacity: 1 };
  }
  if (ph.exit >= 1 && ph.move >= 1 && ph.enter >= 1) {
    return { geometry: to, opacities: undefined, groupOpacity: 1 };
  }
  const move = ph.move;

  const opacities: Record<string, number> = {};
  const nodes: Geometry["nodes"] = {};
  for (const [id, na] of Object.entries(from.nodes)) {
    const nb = to.nodes[id];
    if (nb === undefined) {
      nodes[id] = na;
      opacities[nodeOpacityKey(id)] = 1 - ph.exit;
    } else {
      nodes[id] = {
        ...nb,
        x: na.x + (nb.x - na.x) * move,
        y: na.y + (nb.y - na.y) * move,
        w: na.w + (nb.w - na.w) * move,
        h: na.h + (nb.h - na.h) * move,
      };
    }
  }
  for (const [id, nb] of Object.entries(to.nodes)) {
    if (from.nodes[id] === undefined) {
      nodes[id] = nb;
      opacities[nodeOpacityKey(id)] = ph.enter;
    }
  }

  const edges: Geometry["edges"] = {};
  for (const [id, ea] of Object.entries(from.edges)) {
    const eb = to.edges[id];
    if (eb === undefined) {
      edges[id] = ea;
      opacities[edgeOpacityKey(id)] = 1 - ph.exit;
    } else {
      edges[id] = { ...eb, path: tween(ea.path, eb.path, move) };
    }
  }
  for (const [id, eb] of Object.entries(to.edges)) {
    if (from.edges[id] === undefined) {
      edges[id] = eb;
      opacities[edgeOpacityKey(id)] = ph.enter;
    }
  }

  const moving = move < 1;
  return {
    geometry: {
      bounds: {
        x: from.bounds.x + (to.bounds.x - from.bounds.x) * move,
        y: from.bounds.y + (to.bounds.y - from.bounds.y) * move,
        w: from.bounds.w + (to.bounds.w - from.bounds.w) * move,
        h: from.bounds.h + (to.bounds.h - from.bounds.h) * move,
      },
      nodes,
      edges,
      bands: moving ? from.bands : to.bands,
      groups: moving ? from.groups : to.groups,
      // The settled target's hit areas and order record: mid-tween positions
      // never matched either geometry, so the target is the only coherent
      // answer — and carrying `to.order` keeps a mid-tween relayout's prior
      // adoptable (relayout idempotence).
      hitAreas: to.hitAreas,
      warnings: to.warnings,
      order: to.order,
    },
    opacities,
    groupOpacity: moving ? 1 - ph.exit : ph.enter,
  };
}
