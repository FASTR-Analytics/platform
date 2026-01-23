import {
  ReportItemConfig,
  ReportItemContentItem,
  getStartingConfigForReportItem,
  getStartingReportItemPlaceholder,
  isCustomUserSlide,
} from "lib";
import { LayoutNode } from "panther";
import type { SimpleSlide, MixedSlide, AISlideDeckConfig, ContentBlock } from "lib";

// Transform AISlideDeckConfig to array of ReportItemConfig for rendering
export function transformSlideDeckToReportItems(
  deck: AISlideDeckConfig
): ReportItemConfig[] {
  return deck.slides.map((slide) => {
    // If it's already a CustomUserSlide, use its config directly
    if (isCustomUserSlide(slide)) {
      return slide.config;
    }
    // Otherwise transform SimpleSlide to ReportItemConfig
    return transformSlideToReportItem(slide);
  });
}

export function transformSlideToReportItem(slide: SimpleSlide): ReportItemConfig {
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
          content: transformBlocksToContent(slide.blocks ?? []),
        },
      };

    default:
      return base;
  }
}

function transformBlocksToContent(
  blocks: ContentBlock[]
): LayoutNode<ReportItemContentItem> {
  if (blocks.length === 0) {
    // Single placeholder cell
    return {
      type: "item",
      id: crypto.randomUUID(),
      data: getStartingReportItemPlaceholder(),
    };
  }

  const items = blocks.map((block) => transformBlockToContentItem(block));

  // Single item - single cell
  if (items.length === 1) {
    return {
      type: "item",
      id: crypto.randomUUID(),
      data: items[0],
    };
  }

  // Multiple items - arrange in rows
  return {
    type: "rows",
    id: crypto.randomUUID(),
    children: items.map((item) => ({
      type: "item",
      id: crypto.randomUUID(),
      data: item,
    })),
  };
}


function transformBlockToContentItem(
  block: ContentBlock
): ReportItemContentItem {
  const base = getStartingReportItemPlaceholder();

  if (block.type === "text") {
    return {
      ...base,
      type: "text",
      markdown: block.markdown ?? "",
      stretch: undefined as any, // AI slides don't use stretch
    };
  }

  if (block.type === "figure") {
    return {
      ...base,
      type: "figure",
      stretch: undefined as any, // AI slides don't use stretch
      // @ts-ignore - Partial PresentationObjectInReportInfo, matches SlidePreview.tsx pattern
      presentationObjectInReportInfo: block.figureId
        ? {
            id: block.figureId,
            selectedReplicantValue: block.replicant ?? "",
          }
        : undefined,
    };
  }

  return base;
}

// Reverse transform: ReportItemConfig[] -> AISlideDeckConfig
// Useful if we later want to load existing slide decks
export function transformReportItemsToSlideDeck(
  label: string,
  items: ReportItemConfig[]
): AISlideDeckConfig {
  return {
    label,
    version: 1,
    slides: items.map((item, index) => transformReportItemToSlide(item, index)),
  };
}

export function transformReportItemToSlide(
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
        blocks: transformContentToBlocks(item.freeform.content),
      };

    default:
      return { type: "content" };
  }
}

function transformContentToBlocks(
  content: LayoutNode<ReportItemContentItem>
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  // Extract all items from layout tree
  const items = getAllItems(content);

  for (const item of items) {
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

  return blocks;
}

export function getAllItems(
  node: LayoutNode<ReportItemContentItem>
): ReportItemContentItem[] {
  if (node.type === "item") {
    return [node.data];
  }
  const items: ReportItemContentItem[] = [];
  for (const child of node.children) {
    items.push(...getAllItems(child));
  }
  return items;
}
