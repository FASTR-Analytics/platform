// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Primitive } from "../deps.ts";
import { generateLegendPrimitive } from "../_legend/generate_legend_primitive.ts";
import { generateCaptionsPrimitives } from "./generate_captions_primitives.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Surrounds Primitives Generation                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateSurroundsPrimitives(
  mSurrounds: MeasuredSurrounds,
): Primitive[] {
  // Generate caption primitives (title, subtitle, footnotes)
  const captionsPrimitives = generateCaptionsPrimitives(mSurrounds);

  // Generate legend primitive (if legend exists and should be rendered)
  const legendPrimitive =
    mSurrounds.legend && !mSurrounds.s.legend.legendNoRender
      ? generateLegendPrimitive(
        mSurrounds.legend.rcd.topLeftCoords(),
        mSurrounds.legend.mLegend,
        mSurrounds.legend.rcd,
      )
      : undefined;

  return [
    ...captionsPrimitives,
    ...(legendPrimitive ? [legendPrimitive] : []),
  ];
}
