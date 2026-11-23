// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomMarkdownStyle,
  type RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type {
  MarkdownRendererInput,
  MeasuredMarkdown,
  TextMarkdownItem,
} from "../types.ts";
import { parseMarkdown } from "../parser.ts";
import { measureMarkdownItems } from "./measure_items.ts";

export function parseTextMarkdown(markdown: string): TextMarkdownItem[] {
  return parseMarkdown(markdown).items.map((item) => {
    if (item.type === "table" || item.type === "image") {
      const what = item.type === "table" ? "a table" : "an image";
      const where = item.line === undefined ? "" : ` at line ${item.line + 1}`;
      throw new Error(
        `MarkdownRenderer draws text only, got ${what}${where}: give each table and image its own page item, as groupDocElementsByContentType splits markdown`,
      );
    }
    return item;
  });
}

export function measureMarkdown(
  rc: RenderContext,
  bounds: RectCoordsDims,
  input: MarkdownRendererInput,
  fitScale?: number,
  _debug = false,
): MeasuredMarkdown {
  const items = parseTextMarkdown(input.markdown);
  const styleInstance = new CustomMarkdownStyle(input.style, fitScale);
  const style = styleInstance.getMergedMarkdownStyle();
  const result = measureMarkdownItems(
    rc,
    bounds,
    items,
    style,
    style.alignH,
    _debug,
  );
  return {
    inputs: input,
    bounds: result.bounds,
    markdownItems: result.items,
  };
}
