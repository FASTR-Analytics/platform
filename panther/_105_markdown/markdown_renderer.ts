// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  findOptimalScale,
  getAutofitScales,
  getAutofitSizeConstraints,
  getMinWidthAtScale,
  widestOverrun,
} from "./_internal/autofit.ts";
import { measureMarkdown } from "./_internal/measure_markdown.ts";
import { renderMarkdown } from "./_internal/render_markdown.ts";
import {
  RectCoordsDims,
  type RenderContext,
  type Renderer,
  type SizeConstraints,
} from "./deps.ts";
import type { MarkdownRendererInput, MeasuredMarkdown } from "./types.ts";

function measureWithAutofit(
  rc: RenderContext,
  bounds: RectCoordsDims,
  input: MarkdownRendererInput,
): MeasuredMarkdown {
  const scales = getAutofitScales(input);
  if (!scales) {
    return measureMarkdown(rc, bounds, input);
  }

  const optimalScale = findOptimalScale(
    rc,
    bounds.w(),
    bounds.h(),
    input,
    scales,
  );

  // optimalScale is threaded as the fitScale (shrink-to-fit factor).
  const measured = measureMarkdown(rc, bounds, input, optimalScale);
  // cramped: shrank as far as allowed and the content still does not fit the
  // available height or width (e.g. an embedded markdown block in a tight
  // page slot, or a word wider than its column). Measured off the origin, a
  // block's height rounds a hair above the same block's height at the origin,
  // where minH was measured, so the comparison allows half a design unit, as a
  // figure's does.
  const cramped = measured.bounds.h() > bounds.h() + 0.5 ||
    widestOverrun(measured) > 0.5;
  return {
    ...measured,
    inputs: input,
    autofitScale: optimalScale,
    cramped,
  };
}

export const MarkdownRenderer: Renderer<
  MarkdownRendererInput,
  MeasuredMarkdown
> = {
  isType(inputs: unknown): inputs is MarkdownRendererInput {
    return (
      typeof inputs === "object" &&
      inputs !== null &&
      "markdown" in inputs &&
      typeof (inputs as MarkdownRendererInput).markdown === "string"
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    return measureWithAutofit(rc, bounds, input);
  },

  render(rc: RenderContext, measured: MeasuredMarkdown): void {
    renderMarkdown(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    const measured = measureWithAutofit(rc, bounds, input);
    renderMarkdown(rc, measured);
    return measured;
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    input: MarkdownRendererInput,
  ): SizeConstraints {
    const scales = getAutofitScales(input);

    const minComfortableWidth = getMinWidthAtScale(rc, input, 1.0);
    const neededScalingToFitWidth: "none" | number =
      width >= minComfortableWidth ? 1.0 : width / minComfortableWidth;

    if (scales) {
      const constraints = getAutofitSizeConstraints(
        rc,
        width,
        input,
        scales,
      );
      return { ...constraints, neededScalingToFitWidth, minComfortableWidth };
    }

    const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });
    const measured = measureMarkdown(rc, bounds, input);
    const h = measured.bounds.h();

    // Empty markdown should be growable (like placeholder)
    const maxH = input.markdown.trim() === "" ? Infinity : h;

    return {
      minH: h,
      idealH: h,
      maxH,
      // Without autofit the floor scale is 1.
      minW: minComfortableWidth,
      neededScalingToFitWidth,
      minComfortableWidth,
    };
  },
};
