// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { FIGURE_TEXT_ITEM_KEY, textBoxInAlignRcd, Z_INDEX } from "../deps.ts";
import type {
  AlignH,
  FigureTextPrimitive,
  MeasuredText,
  RectCoordsDims,
} from "../deps.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Figure Text Primitives Generation                                      //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateFigureTextPrimitives(
  mSurrounds: MeasuredSurrounds,
): FigureTextPrimitive[] {
  const primitives: FigureTextPrimitive[] = [];

  // Title
  if (mSurrounds.title) {
    primitives.push({
      type: "figure-text",
      key: "title",
      ...alignedText(
        "title",
        mSurrounds.title.mTitle,
        mSurrounds.title.rcd,
        mSurrounds.s.titleAlignH,
      ),
      meta: {
        textType: "title",
        // Figure-level - no i_pane
      },
      mText: mSurrounds.title.mTitle,
      alignH: mSurrounds.s.titleAlignH,
      alignV: "top",
      zIndex: Z_INDEX.FIGURE_TEXT,
    });
  }

  // Subtitle
  if (mSurrounds.subtitle) {
    primitives.push({
      type: "figure-text",
      key: "subtitle",
      ...alignedText(
        "subtitle",
        mSurrounds.subtitle.mSubtitle,
        mSurrounds.subtitle.rcd,
        mSurrounds.s.subtitleAlignH,
      ),
      meta: {
        textType: "subtitle",
        // Figure-level - no i_pane
      },
      mText: mSurrounds.subtitle.mSubtitle,
      alignH: mSurrounds.s.subtitleAlignH,
      alignV: "top",
      zIndex: Z_INDEX.FIGURE_TEXT,
    });
  }

  // Footnotes (can be multiple lines)
  if (mSurrounds.footnote) {
    let currentY = mSurrounds.footnote.rcd.y();
    for (let i = 0; i < mSurrounds.footnote.mFootnotes.length; i++) {
      const mText = mSurrounds.footnote.mFootnotes[i];
      primitives.push({
        type: "figure-text",
        key: `footnote-${i}`,
        ...alignedText(
          "footnote",
          mText,
          mSurrounds.footnote.rcd.getAdjusted({
            y: currentY,
            h: mText.dims.h(),
          }),
          mSurrounds.s.footnoteAlignH,
        ),
        meta: {
          textType: "footnote",
          // Figure-level - no i_pane
        },
        mText,
        alignH: mSurrounds.s.footnoteAlignH,
        alignV: "top",
        zIndex: Z_INDEX.FIGURE_TEXT,
      });
      currentY += mText.dims.h();
    }
  }

  return primitives;
}

// A figure text is aligned top in its align rect; bounds is the text it paints
// there, and the whole align rect reports it.
function alignedText(
  textType: FigureTextPrimitive["meta"]["textType"],
  mText: MeasuredText,
  alignRcd: RectCoordsDims,
  alignH: AlignH,
): Pick<
  FigureTextPrimitive,
  "item" | "part" | "bounds" | "hitBounds" | "alignRcd"
> {
  return {
    item: { [FIGURE_TEXT_ITEM_KEY]: textType },
    part: "label",
    bounds: textBoxInAlignRcd(mText, alignRcd, alignH, "top"),
    hitBounds: alignRcd,
    alignRcd,
  };
}
