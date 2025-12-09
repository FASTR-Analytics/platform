// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomMarkdownStyle,
  type CustomMarkdownStyleOptions,
  MarkdownRenderer,
  type MarkdownRendererInput,
  RectCoordsDims,
} from "./deps.ts";
import { createPdfRenderContextWithFontsBrowser } from "./create_pdf_render_context_browser.ts";
import { downloadPdf } from "./downloads.ts";

export type MarkdownSlidesToPdfOptions = {
  slides: string[];
  style?: CustomMarkdownStyleOptions;
  filename?: string;
  slideWidth?: number;
  slideHeight?: number;
  padding?: number;
  fontPaths?: {
    basePath: string;
    fontMap: Record<string, string>; // Use fontMap.ttf from generated JSON
  };
};

export async function markdownSlidesToPdf(
  options: MarkdownSlidesToPdfOptions,
): Promise<void> {
  const {
    slides,
    style,
    filename = "presentation.pdf",
    slideWidth = 1280,
    slideHeight = 720,
    padding = 60,
    fontPaths,
  } = options;

  if (slides.length === 0) {
    throw new Error("No slides to generate PDF");
  }

  const fonts = style
    ? new CustomMarkdownStyle(style).getFontsToRegister()
    : undefined;

  const { pdf, rc } = await createPdfRenderContextWithFontsBrowser(
    slideWidth,
    slideHeight,
    fonts,
    fontPaths,
  );

  const rcd = new RectCoordsDims([0, 0, slideWidth, slideHeight]);
  const contentBounds = new RectCoordsDims({
    x: padding,
    y: padding,
    w: slideWidth - padding * 2,
    h: slideHeight - padding * 2,
  });

  for (let i = 0; i < slides.length; i++) {
    const markdown = slides[i];

    if (i > 0) {
      pdf.addPage([slideWidth, slideHeight]);
    }

    rc.rRect(rcd, { fillColor: "#ffffff", show: true });

    const input: MarkdownRendererInput = { markdown, style };
    MarkdownRenderer.measureAndRender(rc, contentBounds, input);
  }

  downloadPdf(pdf, filename);
}
