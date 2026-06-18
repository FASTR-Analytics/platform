// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createItemNode,
  type CustomMarkdownStyleOptions,
  debugLog,
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
  docElementToMarkdown,
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

  const gapY = config.gapY ?? 40;

  for (const group of groups) {
    if (shouldGroupForcePageBreak(group, rules, currentPage.length > 0)) {
      if (currentPage.length > 0) {
        pages.push(currentPage);
        currentPage = [];
        currentHeight = 0;
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
      }

      const splitItems = splitContentToFit(
        group.elements,
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
          }
          currentPage.push(createItemNode(splitItem));
          currentHeight += splitHeight;
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
      }

      // Add gap if there's already content (e.g., orphan heading moved here)
      const newPageNeedsGap = currentPage.length > 0;
      const newPageItemHeight = newPageNeedsGap
        ? itemHeight + gapY
        : itemHeight;
      currentPage.push(createItemNode(item));
      currentHeight += newPageItemHeight;
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
    }).idealH;
  }

  if ("tableData" in item) {
    return TableRenderer.getIdealHeight(rc, width, item).idealH;
  }

  if ("image" in item) {
    return ImageRenderer.getIdealHeight(rc, width, item).idealH;
  }

  if (FigureRenderer.isType(item)) {
    return FigureRenderer.getIdealHeight(rc, width, item).idealH;
  }

  return 0;
}

function splitContentToFit(
  elements: ParsedMarkdownItem[],
  firstChunkMaxHeight: number,
  subsequentMaxHeight: number,
  rc: RenderContext,
  width: number,
  style?: CustomMarkdownStyleOptions,
  preventOrphanHeadings?: boolean,
): ConvertedPageContent[] {
  // Split at parsed-element boundaries. Each element (paragraph, heading, code
  // block, …) is an atomic block, never split internally. Serializing the whole
  // group to a string and splitting on blank lines (the previous approach) shred
  // fenced code and math blocks, whose bodies legitimately contain blank lines.
  const blocks = elements.map((el) => docElementToMarkdown(el));
  const splits: ConvertedPageContent[] = [];
  let currentChunk: string[] = [];
  let isFirstChunk = true;

  for (const block of blocks) {
    const maxHeight = isFirstChunk ? firstChunkMaxHeight : subsequentMaxHeight;
    const testChunk = [...currentChunk, block];
    const testMarkdown = testChunk.join("\n\n");
    const testHeight = measureContentHeight(
      rc,
      { markdown: testMarkdown },
      width,
      style,
    );

    if (testHeight <= maxHeight) {
      currentChunk.push(block);
    } else {
      // Before finalizing chunk, check for orphan headings
      if (preventOrphanHeadings && currentChunk.length > 0) {
        const lastBlock = currentChunk[currentChunk.length - 1];
        if (isHeading(lastBlock)) {
          // Move heading to next chunk
          currentChunk.pop();
          if (currentChunk.length > 0) {
            splits.push({ markdown: currentChunk.join("\n\n"), style });
            isFirstChunk = false;
          }
          currentChunk = [lastBlock, block];
          continue;
        }
      }
      if (currentChunk.length > 0) {
        splits.push({ markdown: currentChunk.join("\n\n"), style });
        isFirstChunk = false;
      }
      currentChunk = [block];
      // C13: an atomic block taller than a full page can't be split — it will
      // overflow as a unit rather than be silently shredded. Surface it (gated
      // by PANTHER_DEBUG).
      const blockHeight = measureContentHeight(
        rc,
        { markdown: block },
        width,
        style,
      );
      if (blockHeight > subsequentMaxHeight) {
        debugLog(
          "[markdown pagination] atomic block exceeds page height " +
            `(${Math.round(blockHeight)}du > ${
              Math.round(subsequentMaxHeight)
            }du); it will overflow rather than split.`,
        );
      }
    }
  }

  if (currentChunk.length > 0) {
    splits.push({ markdown: currentChunk.join("\n\n"), style });
  }

  return splits.length > 0
    ? splits
    : [{ markdown: blocks.join("\n\n"), style }];
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
