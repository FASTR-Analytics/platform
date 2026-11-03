// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { transitionTotalMs } from "./deps.ts";
import { resolveSequence } from "./resolve.ts";
import type { SequenceInputs, SequenceTimelineFrame } from "./types.ts";

// At least two frames per transition, so a pair that cuts at half its total
// shows a frame of each side however short a transition whose total is above
// 0.
const MIN_TRANSITION_FRAMES = 2;

export function computeSequenceTimeline(
  sequence: SequenceInputs,
  fps: number,
): SequenceTimelineFrame[] {
  return resolveSequence(sequence).entries.flatMap(
    (entry, i): SequenceTimelineFrame[] => {
      const hold: SequenceTimelineFrame = {
        kind: "hold",
        entry: i,
        seconds: entry.holdMs / 1000,
      };
      if (i === 0) {
        return [hold];
      }
      const total = transitionTotalMs(entry.transition);
      const frames = Math.max(
        MIN_TRANSITION_FRAMES,
        Math.round(total * fps / 1000),
      );
      return [
        ...Array.from({ length: frames }, (_, f): SequenceTimelineFrame => ({
          kind: "transition",
          entry: i,
          elapsedMs: total * f / frames,
          seconds: 1 / fps,
        })),
        hold,
      ];
    },
  );
}
