// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../deps.ts";
import { addLegend } from "../_legend/add_legend.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

export function addSurrounds(
  rc: RenderContext,
  mSurrounds: MeasuredSurrounds,
): void {
  //////////////////////
  //                  //
  //    Background    //
  //                  //
  //////////////////////

  if (mSurrounds.s.backgroundColor !== "none") {
    rc.rRect(mSurrounds.outerRcd, {
      fillColor: mSurrounds.s.backgroundColor,
    });
  }

  ///////////////////
  //               //
  //    Caption    //
  //               //
  ///////////////////

  if (mSurrounds.caption) {
    rc.rText(
      mSurrounds.caption.mCaption,
      mSurrounds.caption.rcd.topLeftCoords(),
      "left",
    );
  }

  ///////////////////////
  //                   //
  //    Sub-caption    //
  //                   //
  ///////////////////////

  if (mSurrounds.subCaption) {
    rc.rText(
      mSurrounds.subCaption.mSubCaption,
      mSurrounds.subCaption.rcd.topLeftCoords(),
      "left",
    );
  }

  ////////////////////
  //                //
  //    Footnote    //
  //                //
  ////////////////////

  if (mSurrounds.footnote) {
    let currentY = mSurrounds.footnote.rcd.y();
    for (const mText of mSurrounds.footnote.mFootnotes) {
      rc.rText(mText, [mSurrounds.footnote.rcd.x(), currentY], "left");
      currentY += mText.dims.h();
    }
    // ctx.fillStyle = "red";
    // ctx.fillRect(
    //   mSurrounds.caption.rcd.x(),
    //   mSurrounds.caption.rcd.y(),
    //   mSurrounds.caption.rcd.w(),
    //   mSurrounds.caption.rcd.h()
    // );
  }

  //////////////////
  //              //
  //    Legend    //
  //              //
  //////////////////

  if (mSurrounds.legend && !mSurrounds.s.legend.legendNoRender) {
    addLegend(
      rc,
      mSurrounds.legend.rcd.topLeftCoords(),
      mSurrounds.legend.mLegend,
    );
  }
}
