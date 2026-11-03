// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { resolveFigureAutofitOptions } from "./deps.ts";
import type { CustomDraw, ShapeRectPrimitive } from "./deps.ts";
import { type FigureInputs, FigureRenderer } from "./figure_renderer.ts";

// A figure as a scene's custom element: measured into the rect it is given,
// at a scale capped by the scene's shrink factor so an embedded chart shrinks
// with the scene around it (its own shrink-to-fit still runs beneath the
// cap). A figure that opted out of shrink-to-fit is held at the scene's
// factor exactly.
export function embedFigure(inputs: FigureInputs): CustomDraw {
  return (rc, rect, sf) => {
    const measured = FigureRenderer.measure(rc, rect, {
      ...inputs,
      autofit: autofitWithin(inputs, sf),
    });
    const background = measured.measuredSurrounds.s.backgroundColor;
    if (background === "none") {
      return measured.primitives;
    }
    const shape: ShapeRectPrimitive = {
      type: "shape-rect",
      key: "background",
      bounds: rect,
      meta: { element: "background" },
      rcd: rect,
      style: { fillColor: background },
    };
    return [shape, ...measured.primitives];
  };
}

function autofitWithin(
  inputs: FigureInputs,
  sf: number,
): FigureInputs["autofit"] {
  const resolved = resolveFigureAutofitOptions(inputs.autofit);
  if (resolved === null) {
    return { minScale: sf, maxScale: sf };
  }
  return {
    minScale: resolved.minScale * sf,
    maxScale: resolved.maxScale * sf,
    minFontSizeDu: resolved.minFontSizeDu,
  };
}
