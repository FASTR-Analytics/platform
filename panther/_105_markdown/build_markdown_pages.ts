// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createItemNode,
  type CustomFigureStyleOptions,
  type CustomMarkdownStyleOptions,
  type ImageMap,
  type LayoutNode,
  type RenderContext,
} from "./deps.ts";
import { type ConvertedPageContent } from "./convert_to_page_content.ts";
import {
  contentGroupToPageContentItem,
  groupDocElementsByContentType,
} from "./convert_to_page_content.ts";
import { type PageBreakRules, paginateMarkdown } from "./paginate_to_pages.ts";
import { parseMarkdown } from "./parse_to_doc_elements.ts";
import type { FigureMap } from "./types.ts";

export type MarkdownPagesConfig = {
  asSlides?: boolean;
  pageWidth: number;
  pageHeight: number;
  pagePadding: number;
  headerHeight?: number;
  footerHeight?: number;
  gapY?: number;
  pageBreakRules?: PageBreakRules;
  styleMarkdown?: CustomMarkdownStyleOptions;
  styleFigure?: CustomFigureStyleOptions;
  images?: ImageMap;
  figures?: FigureMap;
};

export function buildMarkdownPageContents(
  markdown: string,
  config: MarkdownPagesConfig,
  rc: RenderContext,
): LayoutNode<ConvertedPageContent>[][] {
  if (config.asSlides) {
    return markdown.split(/\n---\n/).map((slideMarkdown) => {
      const parsed = parseMarkdown(slideMarkdown);
      const groups = groupDocElementsByContentType(parsed.elements);
      const items = groups
        .map((group) =>
          contentGroupToPageContentItem(
            group,
            config.images,
            config.figures,
            config.styleMarkdown,
            config.styleFigure,
          )
        )
        .filter((item) => item !== undefined)
        .map((item) => createItemNode(item));
      return items;
    });
  }

  const parsed = parseMarkdown(markdown);

  const contentHeight = config.pageHeight -
    config.pagePadding * 2 -
    (config.headerHeight ?? 0) -
    (config.footerHeight ?? 0);

  return paginateMarkdown(parsed.elements, rc, {
    contentWidth: config.pageWidth - config.pagePadding * 2,
    contentHeight,
    gapY: config.gapY,
    pageBreakRules: config.pageBreakRules,
    styleMarkdown: config.styleMarkdown,
    styleFigure: config.styleFigure,
    images: config.images,
    figures: config.figures,
  });
}
