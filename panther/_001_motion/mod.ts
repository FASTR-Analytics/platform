// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type { Easing, PhaseProgress, Transition } from "./types.ts";
export { ease, lerp } from "./easing.ts";
export {
  DEFAULT_TRANSITION,
  phaseProgress,
  resolveTransition,
  transitionTotalMs,
} from "./transition.ts";
