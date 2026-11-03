// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FigureInputs, Transition } from "./deps.ts";

export type SequenceEntry = {
  figure: FigureInputs;
  holdMs?: number;
  // The transition into this entry.
  transition?: Partial<Transition>;
};

// `frame` is in DU: every entry is laid out at this size, so a video has one
// frame size and the holder one canvas height.
export type SequenceInputs = {
  frame: { w: number; h: number };
  defaults: { holdMs: number; transition: Partial<Transition> };
  entries: SequenceEntry[];
};

export type ResolvedSequenceEntry = {
  figure: FigureInputs;
  holdMs: number;
  transition: Transition;
};

export type ResolvedSequence = {
  frame: { w: number; h: number };
  entries: ResolvedSequenceEntry[];
};

// `entry` is the entry held, or the entry a transition frame moves into.
export type SequenceTimelineFrame =
  | { kind: "hold"; entry: number; seconds: number }
  | { kind: "transition"; entry: number; elapsedMs: number; seconds: number };
