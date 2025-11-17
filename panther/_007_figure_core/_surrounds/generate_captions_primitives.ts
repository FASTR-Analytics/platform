// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Coordinates, Z_INDEX } from "../deps.ts";
import type { ChartCaptionPrimitive } from "../deps.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Caption Primitives Generation                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateCaptionsPrimitives(
  mSurrounds: MeasuredSurrounds,
): ChartCaptionPrimitive[] {
  const primitives: ChartCaptionPrimitive[] = [];

  // Main caption (title)
  if (mSurrounds.caption) {
    primitives.push({
      type: "chart-caption",
      key: "caption",
      bounds: mSurrounds.caption.rcd,
      meta: {
        captionType: "caption",
        // Figure-level caption - no paneIndex
      },
      mText: mSurrounds.caption.mCaption,
      position: mSurrounds.caption.rcd.topLeftCoords(),
      alignment: {
        h: "left",
        v: "top",
      },
      zIndex: Z_INDEX.CAPTION,
    });
  }

  // Sub-caption (subtitle)
  if (mSurrounds.subCaption) {
    primitives.push({
      type: "chart-caption",
      key: "sub-caption",
      bounds: mSurrounds.subCaption.rcd,
      meta: {
        captionType: "subtitle",
        // Figure-level caption - no paneIndex
      },
      mText: mSurrounds.subCaption.mSubCaption,
      position: mSurrounds.subCaption.rcd.topLeftCoords(),
      alignment: {
        h: "left",
        v: "top",
      },
      zIndex: Z_INDEX.CAPTION,
    });
  }

  // Footnotes (can be multiple lines)
  if (mSurrounds.footnote) {
    let currentY = mSurrounds.footnote.rcd.y();
    for (let i = 0; i < mSurrounds.footnote.mFootnotes.length; i++) {
      const mText = mSurrounds.footnote.mFootnotes[i];
      primitives.push({
        type: "chart-caption",
        key: `footnote-${i}`,
        bounds: mSurrounds.footnote.rcd,
        meta: {
          captionType: "footnote",
          // Figure-level caption - no paneIndex
        },
        mText,
        position: new Coordinates([mSurrounds.footnote.rcd.x(), currentY]),
        alignment: {
          h: "left",
          v: "top",
        },
        zIndex: Z_INDEX.CAPTION,
      });
      currentY += mText.dims.h();
    }
  }

  return primitives;
}
