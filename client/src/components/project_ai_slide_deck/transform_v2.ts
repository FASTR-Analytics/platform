import { type SimpleSlide, type ContentBlock, getStartingConfigForReportItem } from "lib";
import {
  type PageInputs,
  type PageContentItem,
  type ItemLayoutNode,
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
 * Direct conversion: SimpleSlide → PageInputs for panther rendering
 * Bypasses the ReportItemConfig intermediate format entirely
 */
export async function convertSlideToPageInputs(
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

    console.log("[V2 FIGURE] style.idealAspectRatio:", (resFigure.data as any).style?.idealAspectRatio);
    console.log("[V2 FIGURE] style.scale:", (resFigure.data as any).style?.scale);

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
      padding: [100, 120],
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