import {
  type SimpleSlide,
  type MixedSlide,
  type ContentBlock,
  type ReportItemConfig,
  type ReportItemContentItem,
  getStartingConfigForReportItem,
  isSimpleSlide,
  isCustomUserSlide,
} from "lib";
import {
  type PageInputs,
  type PageContentItem,
  type ItemLayoutNode,
  type LayoutNode,
  type MarkdownRendererInput,
  type FigureInputs,
  type APIResponseWithData,
  type CustomPageStyleOptions,
  type FontInfo,
  createItemNode,
} from "panther";
import { getStyle_SlideDeck } from "~/generate_report/slide_deck/get_style_slide_deck";
import { getPOFigureInputsFromCacheOrFetch } from "~/state/po_cache";

/**
 * Convert MixedSlide (SimpleSlide | CustomUserSlide) → PageInputs for panther rendering
 * Handles both simple AI-friendly format and custom user-edited format
 */
export async function convertSlideToPageInputs(
  projectId: string,
  slide: MixedSlide,
  slideIndex?: number,
): Promise<APIResponseWithData<PageInputs>> {
  // Handle CustomUserSlide - use its full ReportItemConfig
  if (isCustomUserSlide(slide)) {
    return convertReportItemConfigToPageInputs(
      projectId,
      slide.config,
      slideIndex
    );
  }

  // Handle SimpleSlide - original direct conversion logic
  return convertSimpleSlideToPageInputs(projectId, slide, slideIndex);
}

/**
 * Direct conversion: SimpleSlide → PageInputs (original logic)
 */
async function convertSimpleSlideToPageInputs(
  projectId: string,
  slide: SimpleSlide,
  slideIndex?: number,
): Promise<APIResponseWithData<PageInputs>> {
  const base = getStartingConfigForReportItem();
  if (slide.type === "cover") {
    return {
      success: true,
      data: {
        type: "cover",
        title: slide.title,
        subTitle: slide.subtitle,
        author: slide.presenter,
        date: slide.date,
        style: slideDeckStyle
      },
    };
  }

  if (slide.type === "section") {
    return {
      success: true,
      data: {
        ...base,
        type: "section",
        sectionTitle: slide.sectionTitle,
        sectionSubTitle: slide.sectionSubtitle,
        style: slideDeckStyle
      },
    };
  }

  // Content slide - convert blocks to ItemLayoutNode<PageContentItem>[]
  const items: ItemLayoutNode<PageContentItem>[] = [];
  for (const block of slide.blocks ?? []) {
    const result = await convertBlockToPageContentItem(projectId, block);
    if (result.success === false) return result;
    items.push((result.data));
  }


  const pageInputs = {
        ...base,
    type: "freeform" as const,
    header: slide.heading,
    content: {
      layoutType: "optimize" as const,
      items,
    },
        style: slideDeckStyle,
    pageNumber: slideIndex !== undefined ? String(slideIndex + 1) : undefined,
  };


  // const optimizedLayout = optimizeLayout(undefined, items, )

  // DEBUG: Capture slide 3 for testing in panther
  if (slideIndex === 2 && slide.heading?.includes("ANC1")) {
    console.log("[CAPTURE SLIDE 3]", JSON.stringify(pageInputs, null, 2));
  }

  return {
    success: true,
    data: pageInputs,
  };
}

async function convertBlockToPageContentItem(
  projectId: string,
  block: ContentBlock,
): Promise<APIResponseWithData<ItemLayoutNode<PageContentItem>>> {
  if (block.type === "text") {
    const markdown: MarkdownRendererInput = {
      markdown: block.markdown ?? "",
      // autofit: true,  // Let optimizer use flexible text sizing
      autofit: {
        minScale: 0,
        maxScale: 1
      }
    };
    return { success: true, data: createItemNode(markdown) };
  }

  if (block.type === "figure") {
    if (!block.figureId) {
      // Return spacer for missing figures
      return { success: true, data: createItemNode({ spacer: true }) };
    }

    const resFigure = await getPOFigureInputsFromCacheOrFetch(
      projectId,
      block.figureId,
      {
        selectedReplicantValue: block.replicant ?? "",
        // additionalScale: 1 / 3,  // Cancel out the 3x scale in DB config
        hideFigureCaption: false,  // Show captions in AI slides
        hideFigureSubCaption: false,
        hideFigureFootnote: false,
        _forOptimizer: true,  // Override idealAspectRatio to "video"
      } as any,
    );

    if (resFigure.success === false) {
      return { success: true, data: createItemNode({ spacer: true }) };  // Fallback to spacer on error
    }

    // console.log("[V2 FIGURE] style.idealAspectRatio:", (resFigure.data as any).style?.idealAspectRatio);
    // console.log("[V2 FIGURE] style.scale:", (resFigure.data as any).style?.scale);

    return { success: true, data: createItemNode(resFigure.data as FigureInputs, {
      minH: 0
    }) };
  }

  // Unknown block type - return spacer
  return { success: true, data: createItemNode({ spacer: true }) };
}

const _Inter_400: FontInfo = {
  fontFamily: "Inter",
  weight: 400,
  italic: false,
};

const _Inter_800: FontInfo = {
  fontFamily: "Inter",
  weight: 800,
  italic: false,
};

/**
 * Convert ReportItemConfig → PageInputs for CustomUserSlide rendering
 * Uses simplified AI slide deck styling (no report-level config)
 */
export async function convertReportItemConfigToPageInputs(
  projectId: string,
  config: ReportItemConfig,
  slideIndex?: number,
): Promise<APIResponseWithData<PageInputs>> {
  try {
    // Cover slide
    if (config.type === "cover") {
      return {
        success: true,
        data: {
          type: "cover",
          title: config.cover.titleText,
          subTitle: config.cover.subTitleText,
          author: config.cover.presenterText,
          date: config.cover.dateText,
          style: slideDeckStyle,
        },
      };
    }

    // Section slide
    if (config.type === "section") {
      return {
        success: true,
        data: {
          type: "section",
          sectionTitle: config.section.sectionText,
          sectionSubTitle: config.section.smallerSectionText,
          style: slideDeckStyle,
        },
      };
    }

    // Freeform slide - content is now always a LayoutNode
    const content = config.freeform.content;

    // Convert layout tree (preserving structure)
    const convertedLayout = await convertLayoutNodeToPageContentItems(
      projectId,
      content
    );

    const pageInputs = {
      type: "freeform" as const,
      header: config.freeform.useHeader ? config.freeform.headerText : undefined,
      content: { layoutType: "explicit" as const, layout: convertedLayout },
      style: slideDeckStyle,
      pageNumber: slideIndex !== undefined ? String(slideIndex + 1) : undefined,
    };

    return {
      success: true,
      data: pageInputs,
    };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem converting ReportItemConfig to PageInputs: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}

/**
 * Convert LayoutNode<ReportItemContentItem> to LayoutNode<PageContentItem>
 * Preserves layout structure (rows/cols/items)
 */
async function convertLayoutNodeToPageContentItems(
  projectId: string,
  node: LayoutNode<ReportItemContentItem>
): Promise<LayoutNode<PageContentItem>> {
  // Item node - convert the data
  if (node.type === "item") {
    const convertedData = await convertSingleContentItem(projectId, node.data);
    return {
      type: "item",
      id: node.id,
      data: convertedData,
    };
  }

  // Rows/Cols node - recursively convert children
  const convertedChildren: LayoutNode<PageContentItem>[] = [];
  for (const child of node.children) {
    const converted = await convertLayoutNodeToPageContentItems(projectId, child);
    convertedChildren.push(converted);
  }

  return {
    type: node.type,
    id: node.id,
    children: convertedChildren,
  };
}

/**
 * Convert single ReportItemContentItem to PageContentItem
 */
async function convertSingleContentItem(
  projectId: string,
  item: ReportItemContentItem
): Promise<PageContentItem> {
  if (item.type === "text") {
    const markdown: MarkdownRendererInput = {
      markdown: item.markdown ?? "",
      autofit: {
        minScale: 0,
        maxScale: item.textSize,
      },
    };
    return markdown;
  }

  if (item.type === "figure" && item.presentationObjectInReportInfo?.id) {
    const resFigure = await getPOFigureInputsFromCacheOrFetch(
      projectId,
      item.presentationObjectInReportInfo.id,
      {
        selectedReplicantValue:
          item.presentationObjectInReportInfo.selectedReplicantValue ?? "",
        hideFigureCaption: item.hideFigureCaption,
        hideFigureSubCaption: item.hideFigureSubCaption,
        hideFigureFootnote: item.hideFigureFootnote,
        additionalScale: item.useFigureAdditionalScale
          ? item.figureAdditionalScale
          : undefined,
        _forOptimizer: true,
      } as any,
    );
    if (resFigure.success) {
      return resFigure.data as FigureInputs;
    }
  }

  // Fallback: spacer
  return { spacer: true };
}

export const slideDeckStyle: CustomPageStyleOptions = {
    text: {
      coverTitle: {
        font: _Inter_800,
        relFontSize:  6,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      coverSubTitle: {
        font: _Inter_400,
        relFontSize: 4,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      coverAuthor: {
        font: _Inter_800,
        relFontSize:  2,
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
      coverDate: {
        font: _Inter_400,
        relFontSize: 1.5,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      //
      sectionTitle: {
        font: _Inter_800,
        relFontSize:  4,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      },
      sectionSubTitle: {
        font: _Inter_400,
        relFontSize:
         2,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      //
      header: {
        font: _Inter_800,
        relFontSize: 4,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      footer: {
        font: _Inter_400,
        relFontSize: 1.4,
        letterSpacing: "-0.02em",
      },
      //
      // paragraph: {
      //   font: _Inter_400,
      //   relFontSize: 2.3,
      //   lineHeight: 1.4,
      //   lineBreakGap: 0.7,
      // },
      pageNumber: {
        font: _Inter_400,
        relFontSize: 1.5,
      },
    },
    cover: {
      logoGapX: 80,
      gapY: 60,
      backgroundColor: "white"
    },
    header: {
      padding: [100, 120, 0, 120],
      backgroundColor: "white"
    },
    footer: {
      logoGapX: 80,
      padding: [100, 120],
    },
    content: {
      padding: [100, 120],
      // tabWidth: 10,
      gapX: 100,
      gapY: 80,
    },
    section: {
      backgroundColor: "white"
    },
  };