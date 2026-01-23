import type {
  Slide,
  ContentBlock,
} from "lib";
import type {
  APIResponseWithData,
  PageInputs,
  PageContentItem,
  LayoutNode,
  CustomPageStyleOptions,
} from "panther";

export const slideDeckStyle: CustomPageStyleOptions = {
  text: {
    coverTitle: { relFontSize: 6, lineHeight: 1 },
    coverSubTitle: { relFontSize: 4, lineHeight: 1.1 },
    coverAuthor: { relFontSize: 2, lineHeight: 1.2 },
    coverDate: { relFontSize: 1.5, lineHeight: 1.1 },
    sectionTitle: { relFontSize: 4, lineHeight: 1.05 },
    sectionSubTitle: { relFontSize: 2, lineHeight: 1.1 },
    header: { relFontSize: 4, lineHeight: 1 },
    pageNumber: { relFontSize: 1.5 },
  },
  cover: { backgroundColor: "white" },
  section: { backgroundColor: "white" },
  header: { padding: [100, 120, 0, 120] as [number, number, number, number], backgroundColor: "white" },
  content: { padding: [100, 120] as [number, number], gapX: 100, gapY: 80 },
};

export async function convertSlideToPageInputs(
  projectId: string,
  slide: Slide,
  slideIndex?: number
): Promise<APIResponseWithData<PageInputs>> {
  if (slide.type === "cover") {
    return {
      success: true,
      data: {
        type: "cover",
        title: slide.title,
        subTitle: slide.subtitle,
        author: slide.presenter,
        date: slide.date,
        style: slideDeckStyle,
      },
    };
  }

  if (slide.type === "section") {
    return {
      success: true,
      data: {
        type: "section",
        sectionTitle: slide.sectionTitle,
        sectionSubTitle: slide.sectionSubtitle,
        style: slideDeckStyle,
      },
    };
  }

  // Content slide - layout is already explicit LayoutNode
  const convertedLayout = convertLayoutNode(slide.layout);

  return {
    success: true,
    data: {
      type: "freeform",
      header: slide.heading,
      content: {
        layoutType: "explicit",
        layout: convertedLayout,
      },
      style: slideDeckStyle,
      pageNumber: slideIndex !== undefined ? String(slideIndex + 1) : undefined,
    },
  };
}

// Convert LayoutNode<ContentBlock> to LayoutNode<PageContentItem>
function convertLayoutNode(node: LayoutNode<ContentBlock>): LayoutNode<PageContentItem> {
  if (node.type === "item") {
    return {
      type: "item",
      id: node.id,
      data: convertBlockToPageContentItem(node.data),
    };
  }

  // Rows/cols - recurse
  return {
    type: node.type,
    id: node.id,
    children: node.children.map(convertLayoutNode),
  };
}

function convertBlockToPageContentItem(block: ContentBlock): PageContentItem {
  if (block.type === "text") {
    return {
      markdown: block.markdown,
      autofit: { minScale: 0, maxScale: 1 },
    };
  }

  // Figure block - figureInputs already resolved
  return block.figureInputs;
}
