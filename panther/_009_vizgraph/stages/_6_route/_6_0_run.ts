// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  PipelineStep,
  ProperGraph,
} from "../../_internal/pipeline_types.ts";
import type { LayoutOptions, ResolvedSpacing } from "../../types_options.ts";
import { classifyEdges, classifyStep } from "./_6_1_classify.ts";
import { assignPorts, portsStep } from "./_6_2_ports.ts";
import {
  gutterReserve,
  maxThicknessPerGutter,
  packTracks,
  tracksStep,
} from "./_6_3_tracks.ts";
import { xStep } from "./_6_4_x.ts";
import { channelsStep } from "./_6_5_channels.ts";
import { pointsStep } from "./_6_6_points.ts";

// Stage 6 runner: 6.1 classify → 6.2 ports → 6.3 tracks → 6.4 x →
// 6.5 channels → 6.6 points. Polyline routing has no tracks and no channel
// levels, so its resolved sequence omits 6.3 and 6.5 (step 6.4 defaults the
// track counts to zero; immediate edges route as straight polylines).
export function routeSteps(options: LayoutOptions | undefined): PipelineStep[] {
  const polyline = options?.routing === "polyline";
  return [
    classifyStep,
    portsStep,
    ...(polyline ? [] : [tracksStep]),
    xStep,
    ...(polyline ? [] : [channelsStep]),
    pointsStep,
  ];
}

// Total horizontal space all gutters consume (interior pads + reserved track
// bundles) at the CURRENT y state — a composition of the 6.1–6.3 math over a
// spacing variant. Step 4.3 calls this to know how much of fit.width remains
// for node columns; the stage-6 steps recompute the same quantities for the
// final geometry.
export function computeGutterTotal(
  proper: ProperGraph,
  options: LayoutOptions | undefined,
  spacing: ResolvedSpacing,
): number {
  const redges = classifyEdges(proper);
  const fans = assignPorts(redges, spacing);
  const gutterCount = proper.layers.length + 1;
  const trackCounts = options?.routing === "polyline"
    ? new Array(gutterCount).fill(0)
    : packTracks(redges, gutterCount, fans);
  const gutterThickness = maxThicknessPerGutter(redges, gutterCount);
  let total = 0;
  for (let g = 0; g < gutterCount; g++) {
    total += gutterReserve(
      g,
      gutterCount - 1,
      trackCounts,
      gutterThickness,
      spacing,
    );
  }
  return total;
}
