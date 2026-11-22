// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createItemNode,
  type CustomMarkdownStyleOptions,
  type ImageMap,
  type LayoutNode,
  Padding,
  type PaddingOptions,
  type RenderContext,
} from "./deps.ts";
import type { ConvertedPageContent } from "./convert_to_page_content.ts";
import {
  contentGroupToPageContentItem,
  groupDocElementsByContentType,
} from "./convert_to_page_content.ts";
import { type PageBreakRules, paginateMarkdown } from "./paginate_to_pages.ts";
import { parseMarkdown } from "./parser.ts";
import type { FigureMap } from "./types.ts";

export type MarkdownPagesConfig = {
  asSlides?: boolean;
  pageWidth: number;
  pageHeight: number;
  pagePadding: PaddingOptions;
  headerHeight?: number;
  footerHeight?: number;
  gapY?: number;
  pageBreakRules?: PageBreakRules;
  style?: CustomMarkdownStyleOptions;
  images?: ImageMap;
  figures?: FigureMap;
};

export function buildMarkdownPageContents(
  markdown: string,
  config: MarkdownPagesConfig,
  rc: RenderContext,
): LayoutNode<ConvertedPageContent>[][] {
  if (config.asSlides) {
    // A slide separator is a line that is exactly "---". The previous
    // `/\n---\n/` required a newline on both sides, so a leading separator (or
    // one without surrounding blank lines) was missed.
    return markdown.split(/^---$/m).map((slideMarkdown) => {
      const parsed = parseMarkdown(slideMarkdown);
      const groups = groupDocElementsByContentType(parsed.items);
      const items = groups
        .map((group) =>
          contentGroupToPageContentItem(
            group,
            config.images,
            config.figures,
            config.style,
          )
        )
        .filter((item) => item !== undefined)
        .map((item) => createItemNode(item));
      return items;
    });
  }

  const parsed = parseMarkdown(markdown);
  const padding = new Padding(config.pagePadding);

  const contentHeight = config.pageHeight -
    padding.totalPy() -
    (config.headerHeight ?? 0) -
    (config.footerHeight ?? 0);

  return paginateMarkdown(parsed.items, rc, {
    contentWidth: config.pageWidth - padding.totalPx(),
    contentHeight,
    gapY: config.gapY,
    pageBreakRules: config.pageBreakRules,
    style: config.style,
    images: config.images,
    figures: config.figures,
  });
}
