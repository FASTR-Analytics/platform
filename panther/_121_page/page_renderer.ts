// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measurePage } from "./_internal/measure_page.ts";
import { renderPage } from "./_internal/render_page.ts";
import type { RectCoordsDims, RenderContext } from "./deps.ts";
import type { MeasuredPage, PageInputs } from "./types.ts";

type PageRendererType = {
  isType(item: unknown): item is PageInputs;
  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PageInputs,
  ): MeasuredPage;
  render(rc: RenderContext, mPage: MeasuredPage): void;
  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PageInputs,
  ): void;
};

export const PageRenderer: PageRendererType = {
  isType(item: unknown): item is PageInputs {
    return (
      typeof item === "object" &&
      item !== null &&
      "type" in item &&
      ((item as PageInputs).type === "cover" ||
        (item as PageInputs).type === "freeform" ||
        (item as PageInputs).type === "section")
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PageInputs,
  ): MeasuredPage {
    return measurePage(rc, bounds, item);
  },

  render(rc: RenderContext, mPage: MeasuredPage): void {
    renderPage(rc, mPage);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    item: PageInputs,
  ): void {
    const mPage = measurePage(rc, bounds, item);
    renderPage(rc, mPage);
  },
};
