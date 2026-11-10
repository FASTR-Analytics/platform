// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { CAPTION_ITEM_KEY, textBoxInAnchor, Z_INDEX } from "../deps.ts";
import type {
  AlignH,
  FigureCaptionPrimitive,
  MeasuredText,
  RectCoordsDims,
} from "../deps.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Caption Primitives Generation                                          //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateCaptionsPrimitives(
  mSurrounds: MeasuredSurrounds,
): FigureCaptionPrimitive[] {
  const primitives: FigureCaptionPrimitive[] = [];

  // Main caption (title)
  if (mSurrounds.caption) {
    primitives.push({
      type: "figure-caption",
      key: "caption",
      ...anchoredText(
        "caption",
        mSurrounds.caption.mCaption,
        mSurrounds.caption.rcd,
        mSurrounds.s.captionAlignH,
      ),
      meta: {
        captionType: "caption",
        // Figure-level caption - no paneIndex
      },
      mText: mSurrounds.caption.mCaption,
      alignment: {
        h: mSurrounds.s.captionAlignH,
        v: "top",
      },
      zIndex: Z_INDEX.CAPTION,
    });
  }

  // Sub-caption (subtitle)
  if (mSurrounds.subCaption) {
    primitives.push({
      type: "figure-caption",
      key: "sub-caption",
      ...anchoredText(
        "subtitle",
        mSurrounds.subCaption.mSubCaption,
        mSurrounds.subCaption.rcd,
        mSurrounds.s.subCaptionAlignH,
      ),
      meta: {
        captionType: "subtitle",
        // Figure-level caption - no paneIndex
      },
      mText: mSurrounds.subCaption.mSubCaption,
      alignment: {
        h: mSurrounds.s.subCaptionAlignH,
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
        type: "figure-caption",
        key: `footnote-${i}`,
        ...anchoredText(
          "footnote",
          mText,
          mSurrounds.footnote.rcd.getAdjusted({
            y: currentY,
            h: mText.dims.h(),
          }),
          mSurrounds.s.footnoteAlignH,
        ),
        meta: {
          captionType: "footnote",
          // Figure-level caption - no paneIndex
        },
        mText,
        alignment: {
          h: mSurrounds.s.footnoteAlignH,
          v: "top",
        },
        zIndex: Z_INDEX.CAPTION,
      });
      currentY += mText.dims.h();
    }
  }

  return primitives;
}

// A caption is aligned top in its slot; bounds is the text it paints there,
// and the whole slot reports it.
function anchoredText(
  captionType: FigureCaptionPrimitive["meta"]["captionType"],
  mText: MeasuredText,
  anchorRcd: RectCoordsDims,
  alignH: AlignH,
): Pick<
  FigureCaptionPrimitive,
  "item" | "part" | "bounds" | "hitBounds" | "anchorRcd"
> {
  return {
    item: { [CAPTION_ITEM_KEY]: captionType },
    part: "label",
    bounds: textBoxInAnchor(mText, anchorRcd, alignH, "top"),
    hitBounds: anchorRcd,
    anchorRcd,
  };
}
