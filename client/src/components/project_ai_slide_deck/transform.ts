import {
  ReportItemConfig,
  ReportItemContentItem,
  getStartingConfigForReportItem,
  getStartingReportItemPlaceholder,
} from "lib";
import type { SimpleSlide, SimpleSlideDeck, ContentBlock, ContentLayout } from "./types";

// Transform SimpleSlideDeck to array of ReportItemConfig for rendering
export function transformSlideDeckToReportItems(
  deck: SimpleSlideDeck
): ReportItemConfig[] {
  return deck.slides.map((slide) => transformSlideToReportItem(slide));
}

function transformSlideToReportItem(slide: SimpleSlide): ReportItemConfig {
  const base = getStartingConfigForReportItem();

  switch (slide.type) {
    case "cover":
      return {
        ...base,
        type: "cover",
        cover: {
          ...base.cover,
          titleText: slide.title ?? "",
          subTitleText: slide.subtitle ?? "",
          presenterText: slide.presenter ?? "",
          dateText: slide.date ?? "",
        },
      };

    case "section":
      return {
        ...base,
        type: "section",
        section: {
          ...base.section,
          sectionText: slide.sectionTitle ?? "",
          smallerSectionText: slide.sectionSubtitle ?? "",
        },
      };

    case "content":
      return {
        ...base,
        type: "freeform",
        freeform: {
          useHeader: !!slide.heading,
          headerText: slide.heading ?? "",
          content: transformBlocksToContent(
            slide.blocks ?? [],
            slide.layout ?? "single"
          ),
        },
      };

    default:
      return base;
  }
}

function transformBlocksToContent(
  blocks: ContentBlock[],
  layout: string
): ReportItemContentItem[][] {
  if (blocks.length === 0) {
    return [[getStartingReportItemPlaceholder()]];
  }

  // Determine column spans based on layout
  const spans = getSpansForLayout(layout, blocks.length);

  // Create single row with all blocks
  const row: ReportItemContentItem[] = blocks.map((block, i) =>
    transformBlockToContentItem(block, spans[i])
  );

  return [row];
}

function getSpansForLayout(layout: string, blockCount: number): number[] {
  // Total span is typically 12 (like a 12-column grid)
  switch (layout) {
    case "single":
      return [12];

    case "two-column":
      if (blockCount === 1) return [12];
      if (blockCount === 2) return [6, 6];
      return blocks(blockCount, 6);

    case "two-column-wide-left":
      if (blockCount === 1) return [12];
      if (blockCount === 2) return [8, 4];
      return [8, ...blocks(blockCount - 1, 4)];

    case "two-column-wide-right":
      if (blockCount === 1) return [12];
      if (blockCount === 2) return [4, 8];
      return [4, ...blocks(blockCount - 1, 8)];

    case "three-column":
      if (blockCount === 1) return [12];
      if (blockCount === 2) return [6, 6];
      if (blockCount === 3) return [4, 4, 4];
      return blocks(blockCount, 4);

    default:
      return blocks(blockCount, Math.floor(12 / blockCount));
  }
}

function blocks(count: number, span: number): number[] {
  return Array(count).fill(span);
}

function transformBlockToContentItem(
  block: ContentBlock,
  span: number
): ReportItemContentItem {
  const base = getStartingReportItemPlaceholder();

  if (block.type === "text") {
    return {
      ...base,
      type: "text",
      span,
      markdown: block.markdown ?? "",
    };
  }

  if (block.type === "figure") {
    return {
      ...base,
      type: "figure",
      span,
      // @ts-ignore - Partial PresentationObjectInReportInfo, matches SlidePreview.tsx pattern
      presentationObjectInReportInfo: block.figureId
        ? {
            id: block.figureId,
            selectedReplicantValue: block.replicant ?? "",
          }
        : undefined,
    };
  }

  return { ...base, span };
}

// Reverse transform: ReportItemConfig[] -> SimpleSlideDeck
// Useful if we later want to load existing slide decks
export function transformReportItemsToSlideDeck(
  label: string,
  items: ReportItemConfig[]
): SimpleSlideDeck {
  return {
    label,
    slides: items.map((item, index) => transformReportItemToSlide(item, index)),
  };
}

function transformReportItemToSlide(
  item: ReportItemConfig,
  _index: number
): SimpleSlide {
  switch (item.type) {
    case "cover":
      return {
        type: "cover",
        title: item.cover.titleText,
        subtitle: item.cover.subTitleText,
        presenter: item.cover.presenterText,
        date: item.cover.dateText,
      };

    case "section":
      return {
        type: "section",
        sectionTitle: item.section.sectionText,
        sectionSubtitle: item.section.smallerSectionText,
      };

    case "freeform":
      return {
        type: "content",
        heading: item.freeform.headerText,
        layout: inferLayoutFromContent(item.freeform.content),
        blocks: transformContentToBlocks(item.freeform.content),
      };

    default:
      return { type: "content" };
  }
}

function inferLayoutFromContent(
  content: ReportItemContentItem[][]
): ContentLayout {
  if (!content.length || !content[0].length) return "single";

  const firstRow = content[0];
  const count = firstRow.length;

  if (count === 1) return "single";
  if (count === 2) {
    const span0 = firstRow[0].span ?? 6;
    const span1 = firstRow[1].span ?? 6;
    if (span0 > span1) return "two-column-wide-left";
    if (span1 > span0) return "two-column-wide-right";
    return "two-column";
  }
  if (count >= 3) return "three-column";

  return "single";
}

function transformContentToBlocks(
  content: ReportItemContentItem[][]
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const row of content) {
    for (const item of row) {
      if (item.type === "text") {
        blocks.push({
          type: "text",
          markdown: item.markdown ?? "",
        });
      } else if (item.type === "figure") {
        blocks.push({
          type: "figure",
          figureId: item.presentationObjectInReportInfo?.id,
          replicant: item.presentationObjectInReportInfo?.selectedReplicantValue,
        });
      }
      // Skip placeholders and images for now
    }
  }

  return blocks;
}
