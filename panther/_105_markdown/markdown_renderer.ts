// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { measureMarkdown } from "./_internal/measure_markdown.ts";
import { renderMarkdown } from "./_internal/render_markdown.ts";
import { RectCoordsDims, type RenderContext, type Renderer } from "./deps.ts";
import type { MarkdownRendererInput, MeasuredMarkdown } from "./types.ts";

export const MarkdownRenderer: Renderer<
  MarkdownRendererInput,
  MeasuredMarkdown
> = {
  isType(item: unknown): item is MarkdownRendererInput {
    return (
      typeof item === "object" &&
      item !== null &&
      "markdown" in item &&
      typeof (item as MarkdownRendererInput).markdown === "string"
    );
  },

  measure(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    return measureMarkdown(rc, bounds, input);
  },

  render(rc: RenderContext, measured: MeasuredMarkdown): void {
    renderMarkdown(rc, measured);
  },

  measureAndRender(
    rc: RenderContext,
    bounds: RectCoordsDims,
    input: MarkdownRendererInput,
  ): MeasuredMarkdown {
    const measured = measureMarkdown(rc, bounds, input);
    renderMarkdown(rc, measured);
    return measured;
  },

  getIdealHeight(
    rc: RenderContext,
    width: number,
    input: MarkdownRendererInput,
  ): number {
    const bounds = new RectCoordsDims({ x: 0, y: 0, w: width, h: 99999 });
    const measured = measureMarkdown(rc, bounds, input);
    return measured.bounds.h();
  },
};
