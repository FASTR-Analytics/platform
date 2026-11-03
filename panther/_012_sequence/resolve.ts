// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { resolveTransition } from "./deps.ts";
import type { ResolvedSequence, SequenceInputs } from "./types.ts";

export function resolveSequence(sequence: SequenceInputs): ResolvedSequence {
  const d = sequence.defaults;
  return {
    frame: sequence.frame,
    entries: sequence.entries.map((entry) => ({
      figure: entry.figure,
      holdMs: entry.holdMs ?? d.holdMs,
      transition: resolveTransition({
        exitMs: entry.transition?.exitMs ?? d.transition.exitMs,
        moveMs: entry.transition?.moveMs ?? d.transition.moveMs,
        enterMs: entry.transition?.enterMs ?? d.transition.enterMs,
        easing: entry.transition?.easing ?? d.transition.easing,
      }),
    })),
  };
}
