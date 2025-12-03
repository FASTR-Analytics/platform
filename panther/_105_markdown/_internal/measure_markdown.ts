// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomMarkdownStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type { MarkdownRendererInput, MeasuredMarkdown } from "../types.ts";
import { parseMarkdown } from "../parser.ts";
import { measureMarkdownItems } from "./measure_items.ts";

export function measureMarkdown(
  rc: RenderContext,
  bounds: RectCoordsDims,
  input: MarkdownRendererInput,
): MeasuredMarkdown {
  const parsed = parseMarkdown(input.markdown);
  const styleInstance = new CustomMarkdownStyle(input.style);
  const style = styleInstance.getMergedMarkdownStyle();
  const result = measureMarkdownItems(rc, bounds, parsed, style);
  return {
    item: input,
    bounds: result.bounds,
    markdownItems: result.items,
  };
}
