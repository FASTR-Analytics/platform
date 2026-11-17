// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { ease } from "./easing.ts";
import type { PhaseProgress, Transition } from "./types.ts";

export const DEFAULT_TRANSITION: Transition = {
  exitMs: 0,
  moveMs: 500,
  enterMs: 500,
  easing: "ease-in-out",
};

export function resolveTransition(p?: Partial<Transition>): Transition {
  return {
    exitMs: p?.exitMs ?? DEFAULT_TRANSITION.exitMs,
    moveMs: p?.moveMs ?? DEFAULT_TRANSITION.moveMs,
    enterMs: p?.enterMs ?? DEFAULT_TRANSITION.enterMs,
    easing: p?.easing ?? DEFAULT_TRANSITION.easing,
  };
}

export function transitionTotalMs(tr: Transition): number {
  return tr.exitMs + tr.moveMs + tr.enterMs;
}

// A phase of 0 ms is complete the moment it starts.
function progress(
  elapsedMs: number,
  startMs: number,
  durationMs: number,
): number {
  if (elapsedMs < startMs) {
    return 0;
  }
  if (durationMs <= 0) {
    return 1;
  }
  return Math.min(1, (elapsedMs - startMs) / durationMs);
}

export function phaseProgress(
  tr: Transition,
  elapsedMs: number,
): PhaseProgress {
  return {
    exit: progress(elapsedMs, 0, tr.exitMs),
    move: ease(tr.easing, progress(elapsedMs, tr.exitMs, tr.moveMs)),
    enter: progress(elapsedMs, tr.exitMs + tr.moveMs, tr.enterMs),
  };
}
