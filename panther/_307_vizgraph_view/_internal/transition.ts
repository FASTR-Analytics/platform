// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { tween } from "../deps.ts";
import type { Geometry } from "../deps.ts";

// lv4-style two-phase transition (PLAN_VIZGRAPH.md §6 M4): survivors move
// (and removed elements fade out) during the first portion of the timeline;
// newcomers fade in at their destination during the rest. Matched edges are
// tweened pairwise by the engine.
const MOVE_PORTION = 0.7;

// Opacity keys are namespaced ("n:" / "e:") — node and edge id spaces are
// independent, so a shared raw-id record could cross-talk.
export type TransitionFrame = {
  geometry: Geometry;
  opacities: Record<string, number> | undefined;
};

export function nodeOpacityKey(id: string): string {
  return `n:${id}`;
}

export function edgeOpacityKey(id: string): string {
  return `e:${id}`;
}

export function buildTransitionFrame(
  from: Geometry,
  to: Geometry,
  t: number,
): TransitionFrame {
  if (t <= 0) {
    return { geometry: from, opacities: undefined };
  }
  if (t >= 1) {
    return { geometry: to, opacities: undefined };
  }
  const moveT = easeInOut(Math.min(1, t / MOVE_PORTION));
  const fadeOut = Math.min(1, t / MOVE_PORTION);
  const fadeIn = t <= MOVE_PORTION
    ? 0
    : (t - MOVE_PORTION) / (1 - MOVE_PORTION);

  const opacities: Record<string, number> = {};
  const nodes: Geometry["nodes"] = {};
  for (const [id, na] of Object.entries(from.nodes)) {
    const nb = to.nodes[id];
    if (nb === undefined) {
      nodes[id] = na;
      opacities[nodeOpacityKey(id)] = 1 - fadeOut;
    } else {
      nodes[id] = {
        ...nb,
        x: na.x + (nb.x - na.x) * moveT,
        y: na.y + (nb.y - na.y) * moveT,
        w: na.w + (nb.w - na.w) * moveT,
        h: na.h + (nb.h - na.h) * moveT,
      };
    }
  }
  for (const [id, nb] of Object.entries(to.nodes)) {
    if (from.nodes[id] === undefined) {
      nodes[id] = nb;
      opacities[nodeOpacityKey(id)] = fadeIn;
    }
  }

  const edges: Geometry["edges"] = {};
  for (const [id, ea] of Object.entries(from.edges)) {
    const eb = to.edges[id];
    if (eb === undefined) {
      edges[id] = ea;
      opacities[edgeOpacityKey(id)] = 1 - fadeOut;
    } else {
      edges[id] = { ...eb, path: tween(ea.path, eb.path, moveT) };
    }
  }
  for (const [id, eb] of Object.entries(to.edges)) {
    if (from.edges[id] === undefined) {
      edges[id] = eb;
      opacities[edgeOpacityKey(id)] = fadeIn;
    }
  }

  return {
    geometry: {
      bounds: {
        x: from.bounds.x + (to.bounds.x - from.bounds.x) * moveT,
        y: from.bounds.y + (to.bounds.y - from.bounds.y) * moveT,
        w: from.bounds.w + (to.bounds.w - from.bounds.w) * moveT,
        h: from.bounds.h + (to.bounds.h - from.bounds.h) * moveT,
      },
      nodes,
      edges,
      lanes: to.lanes,
      groups: to.groups,
      hitAreas: [],
      warnings: to.warnings,
    },
    opacities,
  };
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
}
