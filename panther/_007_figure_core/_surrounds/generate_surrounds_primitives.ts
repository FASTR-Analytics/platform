// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { SurroundsPrimitive } from "../deps.ts";
import { generateLegendPrimitive } from "../_legend/generate_legend_primitive.ts";
import { generateScaleLegendPrimitive } from "../_legend/generate_scale_legend_primitive.ts";
import { generateCaptionsPrimitives } from "./generate_captions_primitives.ts";
import type { MeasuredSurrounds } from "./measure_surrounds.ts";

////////////////////////////////////////////////////////////////////////////////
//                                                                            //
//    Surrounds Primitives Generation                                        //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export function generateSurroundsPrimitives(
  mSurrounds: MeasuredSurrounds,
): SurroundsPrimitive[] {
  const captionsPrimitives = generateCaptionsPrimitives(mSurrounds);

  let legendPrimitive: SurroundsPrimitive | undefined = undefined;
  if (mSurrounds.legend) {
    if (mSurrounds.legend.type === "items") {
      if (!mSurrounds.s.legend.legendNoRender) {
        legendPrimitive = generateLegendPrimitive(
          mSurrounds.legend.rcd.topLeftCoords(),
          mSurrounds.legend.mLegend,
          mSurrounds.legend.rcd,
          mSurrounds.legend.seriesDimension,
        );
      }
    } else {
      legendPrimitive = generateScaleLegendPrimitive(
        mSurrounds.legend.rcd.topLeftCoords(),
        mSurrounds.legend.mScaleLegend,
        mSurrounds.legend.rcd,
      );
    }
  }

  return [
    ...captionsPrimitives,
    ...(legendPrimitive ? [legendPrimitive] : []),
  ];
}
