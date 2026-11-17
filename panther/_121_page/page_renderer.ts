// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measurePage } from "./_internal/measure_page.ts";
import { renderPage } from "./_internal/render_page.ts";
import type { RectCoordsDims, RenderContext } from "./deps.ts";
import type { MeasuredPage, PageInputs } from "./types.ts";

type PageRendererType = {
  isType(inputs: unknown): inputs is PageInputs;
  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PageInputs,
  ): MeasuredPage;
  render(rc: RenderContext, mPage: MeasuredPage): void;
  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PageInputs,
  ): void;
};

export const PageRenderer: PageRendererType = {
  isType(inputs: unknown): inputs is PageInputs {
    return (
      typeof inputs === "object" &&
      inputs !== null &&
      "type" in inputs &&
      ((inputs as PageInputs).type === "cover" ||
        (inputs as PageInputs).type === "freeform" ||
        (inputs as PageInputs).type === "section")
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PageInputs,
  ): MeasuredPage {
    return measurePage(rc, bounds, inputs);
  },

  render(rc: RenderContext, mPage: MeasuredPage): void {
    renderPage(rc, mPage);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    inputs: PageInputs,
  ): void {
    const mPage = measurePage(rc, bounds, inputs);
    renderPage(rc, mPage);
  },
};
