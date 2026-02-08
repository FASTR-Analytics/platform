import type {
  Slide,
  ContentBlock,
  SlideDeckConfig,
  CoverSlide,
  SectionSlide,
  ColorDetails,
} from "lib";
import { FIGURE_AUTOFIT, getMetricStaticData, getColorDetailsForColorTheme, MARKDOWN_AUTOFIT, _SLIDE_BACKGROUND_COLOR, _CF_RED } from "lib";
import type {
  APIResponseWithData,
  PageInputs,
  PageContentItem,
  LayoutNode,
  ContainerStyleOptions,
  CustomPageStyleOptions,
  FontInfo,
  ImageInputs,
} from "panther";
import { getStyleFromPresentationObject } from "~/generate_visualization/get_style_from_po";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getOverlayImage } from "~/generate_report/get_overlay_image";
import { _SERVER_HOST } from "~/server_actions/config";

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

export function buildStyleForSlide(
  slide: Slide,
  config: SlideDeckConfig,
): CustomPageStyleOptions {
  const cDetails = getColorDetailsForColorTheme(config.colorTheme);

  const hasFooter = slide.type === "content" && !!(slide.footer?.trim());

  const coverFontSizes = slide.type === "cover"
    ? slide as CoverSlide
    : {} as Partial<CoverSlide>;

  const sectionFontSizes = slide.type === "section"
    ? slide as SectionSlide
    : {} as Partial<SectionSlide>;

  return {
    text: {
      coverTitle: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: coverFontSizes.titleTextRelFontSize ?? 10,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      coverSubTitle: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize: coverFontSizes.subTitleTextRelFontSize ?? 6,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      coverAuthor: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: coverFontSizes.presenterTextRelFontSize ?? 4,
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
      coverDate: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize: coverFontSizes.dateTextRelFontSize ?? 3,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      sectionTitle: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: sectionFontSizes.sectionTextRelFontSize ?? 8,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      },
      sectionSubTitle: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize: sectionFontSizes.smallerSectionTextRelFontSize ?? 5,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      header: {
        font: _Inter_800,
        relFontSize: 5.5,
        color: cDetails.baseTextColor,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      footer: {
        font: _Inter_400,
        relFontSize: 2,
        color: cDetails.primaryTextColor,
        letterSpacing: "-0.02em",
      },
      pageNumber: {
        font: _Inter_400,
        color: hasFooter ? cDetails.primaryTextColor : cDetails.baseTextColor,
        relFontSize: 1.5,
      },
    },
    cover: {
      backgroundColor: cDetails.primaryBackgroundColor,
      logoGapX: 80,
      gapY: 60,
    },
    section: {
      backgroundColor: cDetails.primaryBackgroundColor,
    },
    header: {
      backgroundColor: cDetails.baseBackgroundColor,
      padding: [60, 80, 0, 80],
    },
    content: {
      padding: [60, 80],
      backgroundColor: cDetails.baseBackgroundColor,
      gapX: 100,
      gapY: 80,
    },
    footer: {
      backgroundColor: cDetails.primaryBackgroundColor,
      logoGapX: 80,
      padding: [60, 80],
    },
  };
}

async function loadLogos(
  selectedLogos: string[] | undefined,
  availableLogos: string[] | undefined,
): Promise<HTMLImageElement[]> {
  const result: HTMLImageElement[] = [];
  if (!selectedLogos || !availableLogos) return result;
  for (const logo of selectedLogos) {
    if (availableLogos.includes(logo)) {
      const resImg = await getImgFromCacheOrFetch(`${_SERVER_HOST}/${logo}`);
      if (resImg.success) {
        result.push(resImg.data);
      }
    }
  }
  return result;
}

export async function convertSlideToPageInputs(
  projectId: string,
  slide: Slide,
  slideIndex: number | undefined,
  config: SlideDeckConfig,
): Promise<APIResponseWithData<PageInputs>> {
  const style = buildStyleForSlide(slide, config);
  const watermark = config.useWatermark ? config.watermarkText : undefined;
  const overlay = slide.type !== "content" ? await getOverlayImage(config) : undefined;

  if (slide.type === "cover") {
    const titleLogos = await loadLogos(slide.logos, config.logos);
    return {
      success: true,
      data: {
        type: "cover",
        title: slide.title,
        subTitle: slide.subtitle,
        author: slide.presenter,
        date: slide.date,
        titleLogos,
        style,
        watermark,
        overlay,
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
        style,
        watermark,
        overlay,
      },
    };
  }

  const cDetails = getColorDetailsForColorTheme(config.colorTheme);
  const convertedLayout = await convertLayoutNode(slide.layout, cDetails);
  const headerLogos = await loadLogos(slide.headerLogos, config.logos);
  const footerLogos = await loadLogos(slide.footerLogos, config.logos);

  return {
    success: true,
    data: {
      type: "freeform",
      header: slide.header,
      subHeader: slide.subHeader,
      date: slide.date,
      footer: slide.footer,
      headerLogos,
      footerLogos,
      content: {
        layoutType: "explicit",
        layout: convertedLayout,
      },
      style,
      watermark,
      overlay,
    },
  };
}

type ResolvedTextBackground = {
  containerStyle: ContainerStyleOptions;
  textColor: string;
};

function resolveTextBackground(bg: string | undefined, cDetails: ColorDetails): ResolvedTextBackground | undefined {
  if (!bg || bg === "none") return undefined;
  if (bg === "grey") {
    return {
      containerStyle: { backgroundColor: { key: "base200" }, padding: [50, 60] },
      textColor: cDetails.baseTextColor,
    };
  }
  if (bg === "primary") {
    return {
      containerStyle: { backgroundColor: cDetails.primaryBackgroundColor, padding: [50, 60] },
      textColor: cDetails.lightOrDark === "dark" ? "#FFFFFF" : cDetails.baseTextColor,
    };
  }
  if (bg === "success") {
    return {
      containerStyle: { backgroundColor: _SLIDE_BACKGROUND_COLOR, padding: [50, 60] },
      textColor: "#FFFFFF",
    };
  }
  if (bg === "danger") {
    return {
      containerStyle: { backgroundColor: _CF_RED, padding: [50, 60] },
      textColor: "#FFFFFF",
    };
  }
  return undefined;
}

// Convert LayoutNode<ContentBlock> to LayoutNode<PageContentItem>
async function convertLayoutNode(node: LayoutNode<ContentBlock>, cDetails: ColorDetails): Promise<LayoutNode<PageContentItem>> {
  if (node.type === "item") {
    const resolved = node.data.type === "text"
      ? resolveTextBackground(node.data.style?.textBackground, cDetails)
      : undefined;
    return {
      type: "item",
      id: node.id,
      span: node.span,
      data: await convertBlockToPageContentItem(node.data, resolved?.textColor),
      style: resolved?.containerStyle,
    };
  }

  // Rows/cols - recurse
  return {
    type: node.type,
    id: node.id,
    span: node.span,
    children: await Promise.all(node.children.map((c) => convertLayoutNode(c, cDetails))),
  };
}

async function convertBlockToPageContentItem(block: ContentBlock, textColor?: string): Promise<PageContentItem> {
  if (block.type === "text") {
    const baseFontSize = block.style?.textSize
      ? 60 * block.style.textSize
      : 60;
    return {
      markdown: block.markdown,
      autofit: MARKDOWN_AUTOFIT,
      style: {
        text: {
          base: {
            fontSize: baseFontSize,
            ...(textColor ? { color: textColor } : {}),
          },
        },
      },
    };
  }

  if (block.type === "image") {
    if (!block.imgFile) {
      return { spacer: true };
    }
    const resImg = await getImgFromCacheOrFetch(`${_SERVER_HOST}/${block.imgFile}`);
    if (!resImg.success) {
      return { spacer: true };
    }
    const imageItem: ImageInputs = {
      image: resImg.data,
      height: block.style?.imgHeight,
      fit: block.style?.imgFit ?? "contain",
      align: block.style?.imgAlign,
    };
    return imageItem;
  }

  if (!block.figureInputs) {
    return { spacer: true };
  }

  if (block.source?.type === "from_data") {
    try {
      const { formatAs } = getMetricStaticData(block.source.metricId);
      const style = getStyleFromPresentationObject(block.source.config, formatAs);
      return { ...block.figureInputs, autofit: FIGURE_AUTOFIT, style };
    } catch {
      return { ...block.figureInputs, autofit: FIGURE_AUTOFIT };
    }
  }

  return { ...block.figureInputs, autofit: FIGURE_AUTOFIT };
}
