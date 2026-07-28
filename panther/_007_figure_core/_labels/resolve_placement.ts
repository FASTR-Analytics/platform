// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MeasuredText } from "../deps.ts";
import type { LabelMode, LabelPlacement } from "./label_types.ts";

// The defaults below are for callers with no figure style to read — every
// shipped figure passes its own `insideFitFraction` / `maxLabelLines` keys, and
// those are the values that decide what anyone actually sees. Keep the two in
// step: this pair exists so the pure driver has an answer, not so there are two
// places to tune.
const AUTO_INSIDE_FIT_FRACTION = 0.9;
const SINGLE_TEST_MAX_LINES = 1;

export type InsideFitOptions = {
  // Re-measure the text at a trial wrap width. Absent → no re-measuring, and
  // the ladder degenerates to a single test on the mText it was given.
  measureAt?: (wrapWidth: number) => MeasuredText;
  // How many lines a label may wrap to while fighting to stay inside.
  maxLines: number;
  // The share of the room at the anchor the text must fit within.
  insideFitFraction: number;
};

export const DEFAULT_INSIDE_FIT_OPTIONS: InsideFitOptions = {
  maxLines: SINGLE_TEST_MAX_LINES,
  insideFitFraction: AUTO_INSIDE_FIT_FRACTION,
};

export type ResolvedLabelPlacement = {
  placement: LabelPlacement;
  // The text as it must be DRAWN: a ladder rung may have re-wrapped it to earn
  // the inside verdict, so a caller that emits must use this and not what it
  // passed in. Identical to the input whenever the ladder did not re-measure,
  // and always the input on an "outside" verdict — an outside label wraps at
  // the figure's own outside width, which is a separate concern.
  mText: MeasuredText;
};

// A label is only exiled once it cannot be made to work inside. The rungs, in
// order, first success wins:
//
//   1. the text at its own natural (unwrapped) width;
//   2. folded onto 2..maxLines lines, the trial width being the natural width
//      divided by the line count — the wrapper decides where the breaks land
//      and the predicate judges the result;
//   3. otherwise outside.
//
// Bounded at maxLines measurements, deterministic, no search.
//
// "none" is excluded at the type level rather than handled here: a figure that
// draws no labels must skip the whole pass, and a silent fallback would hide
// the miss.
export function resolveLabelPlacement(
  mode: Exclude<LabelMode, "none">,
  fitsInside: ((w: number, h: number) => boolean) | undefined,
  mText: MeasuredText,
  options: InsideFitOptions = DEFAULT_INSIDE_FIT_OPTIONS,
): ResolvedLabelPlacement {
  if (mode === "inside") return { placement: "inside", mText };
  if (mode === "outside") return { placement: "outside", mText };
  if (!fitsInside) return { placement: "inside", mText };

  const { measureAt, maxLines, insideFitFraction } = options;

  const natural = measureAt ? measureAt(Infinity) : mText;
  if (fitsWithin(fitsInside, natural, insideFitFraction)) {
    return { placement: "inside", mText: natural };
  }
  if (!measureAt) return { placement: "outside", mText };

  const naturalWidth = natural.dims.w();
  for (let lines = 2; lines <= maxLines; lines++) {
    const trial = measureAt(naturalWidth / lines);
    if (fitsWithin(fitsInside, trial, insideFitFraction)) {
      return { placement: "inside", mText: trial };
    }
  }
  return { placement: "outside", mText };
}

// The fraction is applied by inflating the box asked for rather than shrinking
// the room, so the predicate stays a pure statement about geometry: the text
// must occupy no more than that share of what is actually there.
function fitsWithin(
  fitsInside: (w: number, h: number) => boolean,
  mText: MeasuredText,
  insideFitFraction: number,
): boolean {
  return fitsInside(
    mText.dims.w() / insideFitFraction,
    mText.dims.h() / insideFitFraction,
  );
}
