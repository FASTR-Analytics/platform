import type {
  Slide,
  ContentBlock,
  SlideDeckConfig,
  CoverSlide,
  SectionSlide,
} from "lib";
import {
  FIGURE_AUTOFIT,
  getPrimaryColor,
  getTextColorForBackground,
  MARKDOWN_AUTOFIT,
  _SLIDE_BACKGROUND_COLOR,
  _CF_RED,
} from "lib";
import type {
  APIResponseWithData,
  PageInputs,
  PageContentItem,
  LayoutNode,
  ContainerStyleOptions,
  CustomPageStyleOptions,
  FigureInputs,
  FontInfo,
  ImageInputs,
} from "panther";
import { resolvePageStyle } from "panther";
import { hydrateFigureInputsForRendering } from "~/generate_visualization/mod";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getOverlayImage } from "./get_overlay_image";
import { _SERVER_HOST } from "~/server_actions";

export const FASTR_LOGOS = [
  {
    value: "images/FASTR_Primary_01_Horiz.png",
    label: { en: "FASTR (colored)", fr: "FASTR (couleur)" },
  },
  {
    value: "images/FASTR_White_Horiz.png",
    label: { en: "FASTR (white)", fr: "FASTR (blanc)" },
  },
];

export const FASTR_LOGO_VALUES = FASTR_LOGOS.map((l) => l.value);

function getFont(bold?: boolean, italic?: boolean, defaultBold = false): FontInfo {
  return {
    fontFamily: "International Inter",
    weight: (bold ?? defaultBold) ? 800 : 400,
    italic: italic ?? false,
  };
}

export function buildStyleForSlide(
  slide: Slide,
  config: SlideDeckConfig,
): CustomPageStyleOptions {
  const { style: presetStyle } = resolvePageStyle(
    config.layout,
    config.treatment,
    config.primaryColor,
  );

  const coverFontSizes =
    slide.type === "cover"
      ? (slide as CoverSlide)
      : ({} as Partial<CoverSlide>);

  const sectionFontSizes =
    slide.type === "section"
      ? (slide as SectionSlide)
      : ({} as Partial<SectionSlide>);

  const df = config.deckFooter;
  const footerText =
    slide.type === "content" ? (df ? df.text : slide.footer) : undefined;
  const hasFooter = !!footerText?.trim();

  return {
    text: {
      coverTitle: {
        font: getFont(coverFontSizes.titleBold, coverFontSizes.titleItalic, true),
        color: presetStyle.text!.coverTitle!.color,
        relFontSize: coverFontSizes.titleTextRelFontSize ?? 10,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      coverSubTitle: {
        font: getFont(coverFontSizes.subTitleBold, coverFontSizes.subTitleItalic, false),
        color: presetStyle.text!.coverSubTitle!.color,
        relFontSize: coverFontSizes.subTitleTextRelFontSize ?? 6,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      coverAuthor: {
        font: getFont(coverFontSizes.presenterBold, coverFontSizes.presenterItalic, true),
        color: presetStyle.text!.coverAuthor!.color,
        relFontSize: coverFontSizes.presenterTextRelFontSize ?? 4,
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
      coverDate: {
        font: getFont(coverFontSizes.dateBold, coverFontSizes.dateItalic, false),
        color: presetStyle.text!.coverDate!.color,
        relFontSize: coverFontSizes.dateTextRelFontSize ?? 3,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      sectionTitle: {
        font: getFont(sectionFontSizes.sectionTitleBold, sectionFontSizes.sectionTitleItalic, true),
        color: presetStyle.text!.sectionTitle!.color,
        relFontSize: sectionFontSizes.sectionTextRelFontSize ?? 8,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      },
      sectionSubTitle: {
        font: getFont(sectionFontSizes.sectionSubTitleBold, sectionFontSizes.sectionSubTitleItalic, false),
        color: presetStyle.text!.sectionSubTitle!.color,
        relFontSize: sectionFontSizes.smallerSectionTextRelFontSize ?? 5,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      header: {
        font: getFont(undefined, undefined, true),
        color: presetStyle.text!.header!.color,
        relFontSize: 5.5,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      subHeader: {
        font: getFont(undefined, undefined, false),
        color: presetStyle.text!.subHeader!.color,
        relFontSize: 3.5,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      date: {
        font: getFont(undefined, undefined, false),
        color: presetStyle.text!.date!.color,
        relFontSize: 3,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      footer: {
        font: getFont(undefined, undefined, false),
        color: presetStyle.text!.footer!.color,
        relFontSize: 2,
        letterSpacing: "-0.02em",
      },
      pageNumber: {
        font: getFont(undefined, undefined, false),
        color: hasFooter ? presetStyle.text!.footer!.color : presetStyle.text!.header!.color,
        relFontSize: 1.5,
      },
    },
    cover: {
      background: presetStyle.cover!.background,
      padding: presetStyle.cover!.padding,
      logosSizing: presetStyle.cover!.logosSizing,
      logosPlacement: presetStyle.cover!.logosPlacement,
      titleBottomPadding: presetStyle.cover!.titleBottomPadding,
      subTitleBottomPadding: presetStyle.cover!.subTitleBottomPadding,
      authorBottomPadding: presetStyle.cover!.authorBottomPadding,
      alignH: presetStyle.cover!.alignH,
      alignV: presetStyle.cover!.alignV,
    },
    section: {
      background: presetStyle.section!.background,
      padding: presetStyle.section!.padding,
      sectionTitleBottomPadding: presetStyle.section!.sectionTitleBottomPadding,
      alignH: presetStyle.section!.alignH,
      alignV: presetStyle.section!.alignV,
    },
    freeform: {
      header: {
        background: presetStyle.freeform!.header!.background,
        padding: presetStyle.freeform!.header!.padding,
        logosSizing: presetStyle.freeform!.header!.logosSizing,
        headerBottomPadding: presetStyle.freeform!.header!.headerBottomPadding,
        subHeaderBottomPadding: presetStyle.freeform!.header!.subHeaderBottomPadding,
        bottomBorderStrokeWidth: presetStyle.freeform!.header!.bottomBorderStrokeWidth,
        bottomBorderColor: presetStyle.freeform!.header!.bottomBorderColor,
        alignH: presetStyle.freeform!.header!.alignH,
      },
      content: {
        background: presetStyle.freeform!.content!.background,
        padding: presetStyle.freeform!.content!.padding,
        gapX: presetStyle.freeform!.content!.gapX,
        gapY: presetStyle.freeform!.content!.gapY,
      },
      footer: {
        background: presetStyle.freeform!.footer!.background,
        padding: presetStyle.freeform!.footer!.padding,
        logosSizing: presetStyle.freeform!.footer!.logosSizing,
        alignH: presetStyle.freeform!.footer!.alignH,
      },
    },
  };
}

async function loadLogos(
  selectedLogos: string[] | undefined,
  availableLogos: string[] | undefined,
): Promise<HTMLImageElement[]> {
  const result: HTMLImageElement[] = [];
  if (!selectedLogos) return result;
  for (const logo of selectedLogos) {
    const isFastrLogo = FASTR_LOGO_VALUES.includes(logo);
    if (isFastrLogo || availableLogos?.includes(logo)) {
      const url = isFastrLogo ? `/${logo}` : `${_SERVER_HOST}/${logo}`;
      const resImg = await getImgFromCacheOrFetch(url);
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
  const overlay =
    slide.type !== "content" ? await getOverlayImage(config) : undefined;

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

  const convertedLayout = await convertLayoutNode(
    slide.layout,
    getPrimaryColor(config.primaryColor),
  );
  const df = config.deckFooter;
  const footerText = df ? df.text : slide.footer;
  const footerLogoNames = df ? df.logos : slide.footerLogos;
  const headerLogos = await loadLogos(slide.headerLogos, config.logos);
  const footerLogos = await loadLogos(footerLogoNames, config.logos);

  return {
    success: true,
    data: {
      type: "freeform",
      header: slide.header,
      subHeader: slide.subHeader,
      date: slide.date,
      footer: footerText,
      headerLogos,
      footerLogos,
      content: convertedLayout,
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

function resolveTextBackground(
  bg: string | undefined,
  primaryColor: string,
): ResolvedTextBackground | undefined {
  if (!bg || bg === "none") return undefined;
  if (bg === "grey") {
    return {
      containerStyle: {
        backgroundColor: { key: "base200" },
        padding: [50, 60],
      },
      textColor: "#1E1E1E",
    };
  }
  if (bg === "primary") {
    return {
      containerStyle: { backgroundColor: primaryColor, padding: [50, 60] },
      textColor: getTextColorForBackground(primaryColor),
    };
  }
  if (bg === "success") {
    return {
      containerStyle: {
        backgroundColor: _SLIDE_BACKGROUND_COLOR,
        padding: [50, 60],
      },
      textColor: getTextColorForBackground(_SLIDE_BACKGROUND_COLOR),
    };
  }
  if (bg === "danger") {
    return {
      containerStyle: { backgroundColor: _CF_RED, padding: [50, 60] },
      textColor: getTextColorForBackground(_CF_RED),
    };
  }
  return undefined;
}

async function convertLayoutNode(
  node: LayoutNode<ContentBlock>,
  primaryColor: string,
): Promise<LayoutNode<PageContentItem>> {
  if (node.type === "item") {
    if (!node.data) {
      return {
        type: "item",
        id: node.id,
        span: node.span,
        data: { spacer: true },
      };
    }
    const resolved =
      node.data.type === "text"
        ? resolveTextBackground(node.data.style?.textBackground, primaryColor)
        : undefined;
    return {
      type: "item",
      id: node.id,
      span: node.span,
      data: await convertBlockToPageContentItem(node.data, resolved?.textColor),
      style: resolved?.containerStyle,
    };
  }

  return {
    type: node.type,
    id: node.id,
    span: node.span,
    children: Array.isArray(node.children)
      ? await Promise.all(
          node.children.map((c) => convertLayoutNode(c, primaryColor)),
        )
      : [],
  };
}

async function convertBlockToPageContentItem(
  block: ContentBlock,
  textColor?: string,
): Promise<PageContentItem> {
  if (block.type === "text") {
    const baseFontSize = block.style?.textSize ? 60 * block.style.textSize : 60;
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
    const resImg = await getImgFromCacheOrFetch(
      `${_SERVER_HOST}/${block.imgFile}`,
    );
    if (!resImg.success) {
      return { spacer: true };
    }
    const imageItem: ImageInputs = {
      image: resImg.data,
      fit: block.style?.imgFit ?? "contain",
      align: block.style?.imgAlign,
    };
    return imageItem;
  }

  let fi: FigureInputs | undefined = block.figureInputs;
  if (
    !fi ||
    !(
      "tableData" in fi ||
      "chartData" in fi ||
      "chartOHData" in fi ||
      "timeseriesData" in fi ||
      "simpleVizData" in fi ||
      "mapData" in fi
    )
  ) {
    return { spacer: true };
  }

  // --- LEGACY MIGRATION: remove once all saved slides have been rebuilt ---
  // 1) tierHeaders was moved from yScaleAxisData to the top level of
  //    TimeseriesDataTransformed and ChartOVDataTransformed.
  // 2) yScaleAxisData was split into scaleAxisLimits + yScaleAxisLabel
  //    (PLAN_SCALE_LIMITS_UNIFICATION). laneLimits is mirrored from pane-wide
  //    min/max — safe for ChartOV/Timeseries, which never consult it.
  // Both migrations are runtime-only; saved JSON is not re-persisted here. The
  // yScaleAxisData field is left in place on the migrated object so that a
  // pre-unification panther renderer still works against the same data.
  for (const dataKey of ["timeseriesData", "chartData"] as const) {
    const d: any = (fi as Record<string, any>)[dataKey];
    if (!d?.isTransformed) continue;

    const needsTierHeaders = !d.tierHeaders;
    const needsScaleAxisLimits = !d.scaleAxisLimits && d.yScaleAxisData;
    if (!needsTierHeaders && !needsScaleAxisLimits) continue;

    const laneCount = d.laneHeaders?.length ?? 1;
    const updated: any = { ...d };

    if (needsTierHeaders) {
      updated.tierHeaders = d.yScaleAxisData?.tierHeaders ?? ["default"];
    }
    if (needsScaleAxisLimits) {
      updated.scaleAxisLimits = {
        paneLimits: d.yScaleAxisData.paneLimits.map((p: any) => ({
          valueMin: p.valueMin,
          valueMax: p.valueMax,
          tierLimits: p.tierLimits,
          laneLimits: Array.from({ length: laneCount }, () => ({
            valueMin: p.valueMin,
            valueMax: p.valueMax,
          })),
        })),
      };
      updated.yScaleAxisLabel = d.yScaleAxisData.yScaleAxisLabel;
    }

    fi = { ...fi, [dataKey]: updated };
  }
  // --- END LEGACY MIGRATION ---

  const source = block.source?.type === "from_data"
    ? { config: block.source.config, metricId: block.source.metricId }
    : undefined;
  fi = await hydrateFigureInputsForRendering(fi, source);

  return { ...fi, autofit: FIGURE_AUTOFIT } as PageContentItem;
}
