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
import { createPdfRenderContextWithFontsBrowser } from "./create_pdf_render_context_browser.ts";

export type MarkdownToPdfBrowserConfig = {
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
  };

  styleMarkdown?: CustomMarkdownStyleOptions;
  stylePage?: CustomPageStyleOptions;
  styleFigure?: CustomFigureStyleOptions;

  images?: ImageMap;
  figures?: FigureMap;

  fontPaths: {
    basePath: string;
    fontMap: Record<string, string>;
  };
};

export async function markdownToPdfBrowser(
  markdown: string,
  config: MarkdownToPdfBrowserConfig,
): Promise<jsPDF> {
  const width = config.pageWidth ?? 1280;
  const height = config.pageHeight ?? 720;
  const padding = config.pagePadding ?? 60;

  const markdownStyle = new CustomMarkdownStyle(config.styleMarkdown);
  const pageStyle = new CustomPageStyle(config.stylePage);
  const figureStyle = new CustomFigureStyle(config.styleFigure);
  const mergedPageStyle = pageStyle.getMergedPageStyle();

  const fonts = collectFontsFromStyles([markdownStyle, pageStyle, figureStyle]);

  const { pdf, rc } = await createPdfRenderContextWithFontsBrowser(
    width,
    height,
    fonts,
    config.fontPaths,
  );

  const estimatedHeaderHeight = config.header || config.subHeader || config.date
    ? 100
    : 0;
  const estimatedFooterHeight = config.footer || config.pageNumbers ? 50 : 0;

  const pageContents = buildMarkdownPageContents(
    markdown,
    {
      asSlides: config.asSlides,
      pageWidth: width,
      pageHeight: height,
      pagePadding: padding,
      headerHeight: estimatedHeaderHeight,
      footerHeight: estimatedFooterHeight,
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
