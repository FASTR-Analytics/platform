// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type Easing = "ease-in-out" | "ease-in" | "ease-out" | "linear";

// Three phases in turn, never overlapping: departing elements exit, matched
// elements move on `easing`, arriving elements enter.
export type Transition = {
  exitMs: number;
  moveMs: number;
  enterMs: number;
  easing: Easing;
};

// Each phase's progress, 0 to 1, the move already eased.
export type PhaseProgress = { exit: number; move: number; enter: number };
