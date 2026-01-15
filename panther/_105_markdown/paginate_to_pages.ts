// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createItemNode,
  type CustomMarkdownStyleOptions,
  FigureRenderer,
  type ImageMap,
  ImageRenderer,
  type ItemLayoutNode,
  type LayoutNode,
  MarkdownRenderer,
  type RenderContext,
  TableRenderer,
} from "./deps.ts";
import {
  type ContentGroup,
  contentGroupToPageContentItem,
  type ConvertedPageContent,
  groupDocElementsByContentType,
} from "./convert_to_page_content.ts";
import type { FigureMap, ParsedMarkdownItem } from "./types.ts";

export type PageBreakRules = {
  h1AlwaysNewPage?: boolean;
  h2AlwaysNewPage?: boolean;
  h3AlwaysNewPage?: boolean;
  preventOrphanHeadings?: boolean;
};

export type PaginationConfig = {
  contentWidth: number;
  contentHeight: number;
  gapY?: number; // Gap between items (default from page style)
  pageBreakRules?: PageBreakRules;
  style?: CustomMarkdownStyleOptions;
  images?: ImageMap;
  figures?: FigureMap;
};

export function paginateMarkdown(
  elements: ParsedMarkdownItem[],
  rc: RenderContext,
  config: PaginationConfig,
): LayoutNode<ConvertedPageContent>[][] {
  const rules = {
    h1AlwaysNewPage: config.pageBreakRules?.h1AlwaysNewPage ?? true,
    h2AlwaysNewPage: config.pageBreakRules?.h2AlwaysNewPage ?? false,
    h3AlwaysNewPage: config.pageBreakRules?.h3AlwaysNewPage ?? false,
    preventOrphanHeadings: config.pageBreakRules?.preventOrphanHeadings ??
      false,
  };

  const rawGroups = groupDocElementsByContentType(elements);
  const groups = splitGroupsAtPageBreakHeadings(rawGroups, rules);

  const pages: LayoutNode<ConvertedPageContent>[][] = [];
  let currentPage: LayoutNode<ConvertedPageContent>[] = [];
  let currentHeight = 0;
  let previousGroupType: "text" | "table" | "image" | undefined;

  const gapY = config.gapY ?? 40;

  for (const group of groups) {
    if (shouldGroupForcePageBreak(group, rules, currentPage.length > 0)) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
        previousGroupType = undefined;
      }
    }

    const item = contentGroupToPageContentItem(
      group,
      config.images,
      config.figures,
      config.style,
    );
    if (!item) continue;

    const itemHeight = measureContentHeight(
      rc,
      item,
      config.contentWidth,
      config.style,
    );

    // Add gap between all items (matching layout behavior)
    const needsGap = currentPage.length > 0;
    const heightWithGap = needsGap ? itemHeight + gapY : itemHeight;

    if (currentHeight + heightWithGap <= config.contentHeight) {
      currentPage.push(createItemNode(item));
      currentHeight += heightWithGap;
      previousGroupType = group.type;
      continue;
    }

    // Item doesn't fit on current page - try to split it
    const remainingHeight = config.contentHeight - currentHeight -
      (needsGap ? gapY : 0);
    const isMarkdown = "markdown" in item;

    if (isMarkdown) {
      // For markdown, always split. If no remaining space on current page,
      // start fresh on a new page with full height available
      const effectiveFirstChunkHeight = remainingHeight > 0
        ? remainingHeight
        : config.contentHeight;
      const startNewPage = remainingHeight <= 0;

      if (startNewPage && currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
        previousGroupType = undefined;
      }

      const splitItems = splitContentToFit(
        item,
        effectiveFirstChunkHeight,
        config.contentHeight,
        rc,
        config.contentWidth,
        config.style,
        rules.preventOrphanHeadings,
      );

      for (const splitItem of splitItems) {
        const splitHeight = measureContentHeight(
          rc,
          splitItem,
          config.contentWidth,
          config.style,
        );

        const splitNeedsGap = currentPage.length > 0;
        const splitHeightWithGap = splitNeedsGap
          ? splitHeight + gapY
          : splitHeight;

        if (currentHeight + splitHeightWithGap <= config.contentHeight) {
          currentPage.push(createItemNode(splitItem));
          currentHeight += splitHeightWithGap;
          previousGroupType = group.type;
        } else {
          if (currentPage.length > 0) {
            // Check for orphan heading before finalizing page
            const orphanHeading = rules.preventOrphanHeadings
              ? extractOrphanHeadingFromPage(currentPage)
              : undefined;
            pages.push(currentPage);
            currentPage = orphanHeading ? [orphanHeading] : [];
            currentHeight = orphanHeading
              ? measureContentHeight(
                rc,
                orphanHeading.data,
                config.contentWidth,
                config.style,
              )
              : 0;
            previousGroupType = orphanHeading ? "text" : undefined;
          }
          currentPage.push(createItemNode(splitItem));
          currentHeight += splitHeight;
          previousGroupType = group.type;
        }
      }
    } else {
      // Non-splittable content (table/image) - move to new page if needed
      if (currentPage.length > 0) {
        // Check for orphan heading before finalizing page
        const orphanHeading = rules.preventOrphanHeadings
          ? extractOrphanHeadingFromPage(currentPage)
          : undefined;
        pages.push(currentPage);
        currentPage = orphanHeading ? [orphanHeading] : [];
        currentHeight = orphanHeading
          ? measureContentHeight(
            rc,
            orphanHeading.data,
            config.contentWidth,
            config.style,
          )
          : 0;
        previousGroupType = orphanHeading ? "text" : undefined;
      }

      // Add gap if there's already content (e.g., orphan heading moved here)
      const newPageNeedsGap = currentPage.length > 0;
      const newPageItemHeight = newPageNeedsGap
        ? itemHeight + gapY
        : itemHeight;
      currentPage.push(createItemNode(item));
      currentHeight += newPageItemHeight;
      previousGroupType = group.type;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

function splitGroupsAtPageBreakHeadings(
  groups: ContentGroup[],
  rules: Required<PageBreakRules>,
): ContentGroup[] {
  const result: ContentGroup[] = [];

  for (const group of groups) {
    if (group.type !== "text") {
      result.push(group);
      continue;
    }

    let currentElements: ParsedMarkdownItem[] = [];

    for (const element of group.elements) {
      const shouldSplit = element.type === "heading" &&
        ((element.level === 1 && rules.h1AlwaysNewPage) ||
          (element.level === 2 && rules.h2AlwaysNewPage) ||
          (element.level === 3 && rules.h3AlwaysNewPage));

      if (shouldSplit && currentElements.length > 0) {
        result.push({ type: "text", elements: currentElements });
        currentElements = [];
      }

      currentElements.push(element);
    }

    if (currentElements.length > 0) {
      result.push({ type: "text", elements: currentElements });
    }
  }

  return result;
}

function shouldGroupForcePageBreak(
  group: ContentGroup,
  rules: Required<PageBreakRules>,
  hasContentOnPage: boolean,
): boolean {
  if (!hasContentOnPage) return false;

  if (group.type === "text" && group.elements.length > 0) {
    const firstElement = group.elements[0];
    if (firstElement.type === "heading") {
      if (firstElement.level === 1 && rules.h1AlwaysNewPage) return true;
      if (firstElement.level === 2 && rules.h2AlwaysNewPage) return true;
      if (firstElement.level === 3 && rules.h3AlwaysNewPage) return true;
    }
  }

  return false;
}

function measureContentHeight(
  rc: RenderContext,
  item: ConvertedPageContent,
  width: number,
  style?: CustomMarkdownStyleOptions,
): number {
  if ("markdown" in item) {
    return MarkdownRenderer.getIdealHeight(rc, width, {
      markdown: item.markdown,
      style,
    });
  }

  if ("tableData" in item) {
    return TableRenderer.getIdealHeight(rc, width, item);
  }

  if ("image" in item) {
    return ImageRenderer.getIdealHeight(rc, width, item);
  }

  if (FigureRenderer.isType(item)) {
    return FigureRenderer.getIdealHeight(rc, width, item);
  }

  return 0;
}

function splitContentToFit(
  item: ConvertedPageContent,
  firstChunkMaxHeight: number,
  subsequentMaxHeight: number,
  rc: RenderContext,
  width: number,
  style?: CustomMarkdownStyleOptions,
  preventOrphanHeadings?: boolean,
): ConvertedPageContent[] {
  if (!("markdown" in item)) {
    return [item];
  }

  const paragraphs = item.markdown.split(/\n\n+/);
  const splits: ConvertedPageContent[] = [];
  let currentChunk: string[] = [];
  let isFirstChunk = true;

  for (const para of paragraphs) {
    const maxHeight = isFirstChunk ? firstChunkMaxHeight : subsequentMaxHeight;
    const testChunk = [...currentChunk, para];
    const testMarkdown = testChunk.join("\n\n");
    const testHeight = measureContentHeight(
      rc,
      { markdown: testMarkdown },
      width,
      style,
    );

    if (testHeight <= maxHeight) {
      currentChunk.push(para);
    } else {
      // Before finalizing chunk, check for orphan headings
      if (preventOrphanHeadings && currentChunk.length > 0) {
        const lastPara = currentChunk[currentChunk.length - 1];
        if (isHeading(lastPara)) {
          // Move heading to next chunk
          currentChunk.pop();
          if (currentChunk.length > 0) {
            splits.push({ markdown: currentChunk.join("\n\n"), style });
            isFirstChunk = false;
          }
          currentChunk = [lastPara, para];
          continue;
        }
      }
      if (currentChunk.length > 0) {
        splits.push({ markdown: currentChunk.join("\n\n"), style });
        isFirstChunk = false;
      }
      currentChunk = [para];
    }
  }

  if (currentChunk.length > 0) {
    splits.push({ markdown: currentChunk.join("\n\n"), style });
  }

  return splits.length > 0 ? splits : [item];
}

function isHeading(text: string): boolean {
  return /^#{1,6}\s/.test(text.trim());
}

function extractOrphanHeadingFromPage(
  page: LayoutNode<ConvertedPageContent>[],
): ItemLayoutNode<ConvertedPageContent> | undefined {
  if (page.length === 0) return undefined;

  const lastNode = page[page.length - 1];
  if (lastNode.type !== "item" || !("markdown" in lastNode.data)) {
    return undefined;
  }

  const markdown = lastNode.data.markdown;
  const paragraphs = markdown.split(/\n\n+/);
  const lastPara = paragraphs[paragraphs.length - 1];

  if (!isHeading(lastPara)) return undefined;

  // If entire item is just a heading, remove it from page and return it
  if (paragraphs.length === 1) {
    const style = lastNode.data.style;
    page.pop();
    return createItemNode({ markdown: lastPara, style });
  }

  // Remove the heading from the last item
  paragraphs.pop();
  const style = lastNode.data.style;
  (lastNode.data as { markdown: string; style?: typeof style }).markdown =
    paragraphs.join("\n\n");

  // Return the heading as a new node
  return createItemNode({ markdown: lastPara, style });
}
