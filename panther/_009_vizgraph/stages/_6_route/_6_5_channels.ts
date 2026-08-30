// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PipelineStep } from "../../_internal/pipeline_types.ts";
import type { ResolvedSpacing } from "../../types_options.ts";
import type { REdge, TrackItem } from "./route_shared.ts";
import { portPoint, STRAIGHT_EPS } from "./route_shared.ts";
import { packOrdered } from "./_6_3_tracks.ts";

// Step 6.5 — channel levels for immediate edges. Runs after 6.4: levels need
// final port x's to know which immediate edges actually Z-bend and whose
// runs overlap. Resolved away under polyline routing (immediate edges route
// as straight polylines there).
export const channelsStep: PipelineStep = {
  id: "6.5",
  name: "channels",
  run: (state) => {
    state.route!.channelY = assignChannelLevels(
      state.route!.redges,
      state.spacing,
    );
  },
};

// Immediate edges that must Z-bend share their channel (the gap between two
// adjacent same-layer nodes). Each channel is packed like a tiny transposed
// gutter — TrackItem reused with y↔x and left↔top swapped: intervals are the
// horizontal runs' x-spans, "tracks" are horizontal levels ordered top→down,
// and the direction-aware comparator becomes "rightward-shifters first,
// largest top-entry first" — so runs that would overlap at the shared
// mid-channel y get distinct levels, centered on the channel and compressed
// to fit. A channel with one Z-bend keeps the exact mid-channel y.
export function assignChannelLevels(
  redges: REdge[],
  spacing: ResolvedSpacing,
): Map<REdge, number> {
  type Channel = { items: TrackItem[]; top: number; bottom: number };
  const byChannel = new Map<string, Channel>();
  for (const redge of redges) {
    if (redge.kind !== "immediate") {
      continue;
    }
    const p1 = portPoint(redge.from, redge.fromPort);
    const p2 = portPoint(redge.to, redge.toPort);
    if (Math.abs(p1.x - p2.x) < STRAIGHT_EPS) {
      continue;
    }
    const upper = redge.from.y <= redge.to.y ? redge.from : redge.to;
    const lower = upper === redge.from ? redge.to : redge.from;
    const key = `${redge.from.layerIndex}|${
      Math.min(redge.from.order, redge.to.order)
    }`;
    const channel = byChannel.get(key) ??
      { items: [], top: upper.y + upper.h, bottom: lower.y };
    const downward = redge.fromPort.side === "bottom";
    channel.items.push({
      redge,
      hopIdx: 0,
      lo: Math.min(p1.x, p2.x),
      hi: Math.max(p1.x, p2.x),
      th: redge.edge.thickness ?? 0,
      leftY: downward ? p1.x : p2.x, // transposed: x where the run meets
      rightY: downward ? p2.x : p1.x, //   the channel top / bottom
    });
    byChannel.set(key, channel);
  }

  const levels = new Map<REdge, number>();
  for (const channel of byChannel.values()) {
    channel.items.sort((a, b) => {
      const aRight = a.leftY < a.rightY;
      const bRight = b.leftY < b.rightY;
      if (aRight !== bRight) {
        return aRight ? -1 : 1;
      }
      const byEntry = aRight ? b.leftY - a.leftY : a.leftY - b.leftY;
      return byEntry || a.redge.edge.id.localeCompare(b.redge.edge.id);
    });
    const count = packOrdered(channel.items, 0);
    const maxTh = Math.max(0, ...channel.items.map((item) => item.th));
    const channelH = channel.bottom - channel.top;
    const pitch = count === 1
      ? 0
      : Math.min(spacing.trackGap + maxTh, channelH / count);
    const mid = (channel.top + channel.bottom) / 2;
    for (const item of channel.items) {
      const t = item.redge.trackIdx[0];
      levels.set(item.redge, mid + (t - (count - 1) / 2) * pitch);
    }
  }
  return levels;
}
