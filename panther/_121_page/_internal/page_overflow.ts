// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { isOverflow, type RectCoordsDims } from "../deps.ts";
import type {
  PageHeaderFooterPartNeed,
  PageOverflowCause,
  PageStackPartId,
} from "../types.ts";

type PageOverflow = {
  overflow: boolean;
  overflowCauses: PageOverflowCause[];
};

// One part of a cover's or a section's stack: the height it is drawn at, and
// the width it needs. A text needs its widest line, which is wider than the
// stack only where one word is; a logo row shrinks to any width, so it needs
// none.
export type StackPart = { id: PageStackPartId; height: number; width: number };

export function pageOverflow(
  overflowCauses: PageOverflowCause[],
): PageOverflow {
  return { overflow: overflowCauses.length > 0, overflowCauses };
}

// The stack's height against the page less its padding, and each part's
// width against the padded width.
export function stackOverflow(
  parts: StackPart[],
  totalH: number,
  paddedBounds: RectCoordsDims,
): PageOverflowCause[] {
  const availableH = paddedBounds.h();
  const availableW = paddedBounds.w();
  const height: PageOverflowCause[] = isOverflow(totalH, availableH)
    ? [{
      where: "stack",
      axis: "height",
      need: totalH,
      available: availableH,
      neededBy: parts.map(({ id, height }) => ({ id, need: height })),
    }]
    : [];
  const width = parts.flatMap(({ id, width }): PageOverflowCause[] =>
    isOverflow(width, availableW)
      ? [{
        where: "stack",
        axis: "width",
        need: width,
        available: availableW,
        neededBy: [{ id, need: width }],
      }]
      : []
  );
  return [...height, ...width];
}

export function headerFooterOverflow(
  where: "header" | "footer",
  neededBy: PageHeaderFooterPartNeed[],
  need: number,
  available: number,
): PageOverflowCause[] {
  return isOverflow(need, available)
    ? [{ where, axis: "width", need, available, neededBy }]
    : [];
}
