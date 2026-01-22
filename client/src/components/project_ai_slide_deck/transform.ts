import {
  ReportItemConfig,
  ReportItemContentItem,
  getStartingConfigForReportItem,
  getStartingReportItemPlaceholder,
} from "lib";
import { LayoutNode } from "panther";
import type { SimpleSlide, AISlideDeckConfig, ContentBlock } from "lib";

// Transform AISlideDeckConfig to array of ReportItemConfig for rendering
export function transformSlideDeckToReportItems(
  deck: AISlideDeckConfig
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
          content: transformBlocksToContent(slide.blocks ?? []),
        },
      };

    default:
      return base;
  }
}

function transformBlocksToContent(
  blocks: ContentBlock[]
): { layoutType: "optimize"; items: ReportItemContentItem[] } {
  if (blocks.length === 0) {
    return {
      layoutType: "optimize",
      items: [getStartingReportItemPlaceholder()],
    };
  }

  const items = blocks.map((block) => transformBlockToContentItem(block));

  return {
    layoutType: "optimize",
    items,
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
        blocks: transformContentToBlocks(item.freeform.content),
      };

    default:
      return { type: "content" };
  }
}

function transformContentToBlocks(
  content:
    | { layoutType: "optimize"; items: ReportItemContentItem[] }
    | { layoutType: "explicit"; layout: LayoutNode<ReportItemContentItem> }
    | LayoutNode<ReportItemContentItem> // Legacy format for backwards compatibility
): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  let items: ReportItemContentItem[];

  // Handle new format
  if (typeof content === "object" && content !== null && "layoutType" in content) {
    if (content.layoutType === "optimize") {
      items = content.items;
    } else {
      items = getAllItems(content.layout);
    }
  } else {
    // Handle legacy format (direct LayoutNode)
    items = getAllItems(content);
  }

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

function getAllItems(
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
