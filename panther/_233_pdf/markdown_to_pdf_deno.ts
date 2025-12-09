// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildFreeformPages,
  buildMarkdownPageContents,
  collectFontsFromStyles,
  CustomFigureStyle,
  type CustomFigureStyleOptions,
  CustomMarkdownStyle,
  type CustomMarkdownStyleOptions,
  CustomPageStyle,
  type CustomPageStyleOptions,
  type FigureMap,
  type ImageMap,
  type jsPDF,
  PageRenderer,
  RectCoordsDims,
} from "./deps.ts";
import { createPdfRenderContextWithFontsDeno } from "./utils.ts";

export type MarkdownToPdfDenoConfig = {
  asSlides?: boolean;

  pageWidth?: number;
  pageHeight?: number;
  pagePadding?: number;

  header?: string;
  subHeader?: string;
  footer?: string;
  date?: string;
  pageNumbers?: boolean;
  firstPageHeader?: string;
  firstPageSubHeader?: string;
  skipHeaderOnFirstPage?: boolean;

  pageBreakRules?: {
    h1AlwaysNewPage?: boolean;
    h2AlwaysNewPage?: boolean;
    h3AlwaysNewPage?: boolean;
    preventOrphanHeadings?: boolean;
  };

  styleMarkdown?: CustomMarkdownStyleOptions;
  stylePage?: CustomPageStyleOptions;
  styleFigure?: CustomFigureStyleOptions;

  images?: ImageMap;
  figures?: FigureMap;
};

export async function markdownToPdfDeno(
  markdown: string,
  config: MarkdownToPdfDenoConfig = {},
): Promise<jsPDF> {
  const width = config.pageWidth ?? 1280;
  const height = config.pageHeight ?? 720;
  const padding = config.pagePadding ?? 60;

  const markdownStyle = new CustomMarkdownStyle(config.styleMarkdown);
  const pageStyle = new CustomPageStyle(config.stylePage);
  const figureStyle = new CustomFigureStyle(config.styleFigure);
  const mergedPageStyle = pageStyle.getMergedPageStyle();

  const fonts = collectFontsFromStyles([markdownStyle, pageStyle, figureStyle]);

  const { pdf, rc } = await createPdfRenderContextWithFontsDeno(
    width,
    height,
    fonts,
  );

  // Measure header height using actual text measurement
  const headerPadding = mergedPageStyle.header.padding;
  const maxHeaderTextWidth = width - headerPadding.totalPx();
  let headerHeight = 0;
  if (config.header || config.subHeader || config.date) {
    headerHeight += headerPadding.totalPy();
    headerHeight += mergedPageStyle.header.bottomBorderStrokeWidth;
    let lastExtraToChop = 0;
    if (config.header) {
      const mHeader = rc.mText(
        config.header,
        mergedPageStyle.text.header,
        maxHeaderTextWidth,
      );
      headerHeight += mHeader.dims.h() +
        mergedPageStyle.header.headerBottomPadding;
      lastExtraToChop = mergedPageStyle.header.headerBottomPadding;
    }
    if (config.subHeader) {
      const mSubHeader = rc.mText(
        config.subHeader,
        mergedPageStyle.text.subHeader,
        maxHeaderTextWidth,
      );
      headerHeight += mSubHeader.dims.h() +
        mergedPageStyle.header.subHeaderBottomPadding;
      lastExtraToChop = mergedPageStyle.header.subHeaderBottomPadding;
    }
    if (config.date) {
      const mDate = rc.mText(
        config.date,
        mergedPageStyle.text.date,
        maxHeaderTextWidth,
      );
      headerHeight += mDate.dims.h();
    } else {
      headerHeight -= lastExtraToChop;
    }
  }

  // Measure footer height using actual text measurement
  const footerPadding = mergedPageStyle.footer.padding;
  let footerHeight = 0;
  if (config.footer) {
    const mFooter = rc.mText(
      config.footer,
      mergedPageStyle.text.footer,
      width - footerPadding.totalPx(),
    );
    footerHeight = footerPadding.totalPy() + mFooter.dims.h();
  }

  // Use page style's content padding for actual layout width
  const contentPadding = mergedPageStyle.content.padding;

  const pageContents = buildMarkdownPageContents(
    markdown,
    {
      asSlides: config.asSlides,
      pageWidth: width,
      pageHeight: height,
      pagePadding: contentPadding.totalPx() / 2, // Use page style's content padding
      headerHeight,
      footerHeight,
      gapY: mergedPageStyle.content.gapY,
      pageBreakRules: config.pageBreakRules,
      styleMarkdown: config.styleMarkdown,
      styleFigure: config.styleFigure,
      images: config.images,
      figures: config.figures,
    },
    rc,
  );

  const pages = buildFreeformPages(pageContents, {
    header: config.header,
    subHeader: config.subHeader,
    footer: config.footer,
    date: config.date,
    pageNumbers: config.pageNumbers,
    firstPageHeader: config.firstPageHeader,
    firstPageSubHeader: config.firstPageSubHeader,
    skipHeaderOnFirstPage: config.skipHeaderOnFirstPage,
    style: config.stylePage,
  });

  const rcd = new RectCoordsDims([0, 0, width, height]);

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage([width, height]);
    }

    rc.rRect(rcd, { fillColor: "#ffffff", show: true });

    const measured = PageRenderer.measure(rc, rcd, pages[i]);
    PageRenderer.render(rc, measured);
  }

  return pdf;
}
