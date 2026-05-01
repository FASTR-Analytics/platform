// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomPageStyle,
  FigureRenderer,
  MarkdownRenderer,
  type LayoutNode,
} from "./deps.ts";
import { CustomFigureStyle, CustomMarkdownStyle, deduplicateFonts, type FontInfo } from "./deps.ts";
import type { PageContentItem, PageInputs } from "./types.ts";

const fontCache = new WeakMap<PageInputs, FontInfo[]>();

export function getFontsForPage(pageInputs: PageInputs): FontInfo[] {
  const cached = fontCache.get(pageInputs);
  if (cached) return cached;

  const fonts = extractFontsFromPageInputs(pageInputs);
  fontCache.set(pageInputs, fonts);
  return fonts;
}

function extractFontsFromPageInputs(pageInputs: PageInputs): FontInfo[] {
  const fonts: FontInfo[] = [];

  if (pageInputs.style) {
    fonts.push(...new CustomPageStyle(pageInputs.style).getFontsToRegister());
  }

  if (pageInputs.type === "freeform" && pageInputs.content) {
    walkLayoutForFonts(pageInputs.content, fonts);
  }

  return deduplicateFonts(fonts);
}

function walkLayoutForFonts(
  node: LayoutNode<PageContentItem>,
  fonts: FontInfo[],
): void {
  if (node.type === "item" && node.data) {
    if (MarkdownRenderer.isType(node.data) && node.data.style) {
      fonts.push(...new CustomMarkdownStyle(node.data.style).getFontsToRegister());
    }
    if (FigureRenderer.isType(node.data) && node.data.style) {
      fonts.push(...new CustomFigureStyle(node.data.style).getFontsToRegister());
    }
  }
  if ("children" in node && node.children) {
    for (const child of node.children) {
      walkLayoutForFonts(child, fonts);
    }
  }
}
