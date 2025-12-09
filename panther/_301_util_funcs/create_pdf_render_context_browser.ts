// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { jsPDF } from "jspdf";
import {
  type FontInfo,
  getFontInfoId,
  injectKerningIntoJsPdf,
  PdfRenderContext,
} from "./deps.ts";

export async function createPdfRenderContextWithFontsBrowser(
  width: number,
  height: number,
  fonts?: FontInfo[],
  fontPaths?: {
    basePath: string;
    fontMap: Record<string, string>;
  },
): Promise<{ pdf: jsPDF; rc: PdfRenderContext }> {
  const pdf = new jsPDF({
    orientation: width > height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
    compress: true,
  });

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Failed to get canvas context");
  }

  const createCanvasFn = (w: number, h: number): HTMLCanvasElement => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  };

  // Register fonts if provided
  if (fonts && fonts.length > 0) {
    if (!fontPaths) {
      throw new Error(
        "fontPaths is required when fonts are provided.\n" +
          "Generate font map with: fontconvert ./public/fonts --output-map=./src/generated/font-map.json\n" +
          "Then pass { basePath: '/fonts', fontMap: fontMap.ttf } as fontPaths parameter",
      );
    }

    for (const font of fonts) {
      const fontStyle = font.italic ? "italic" : "normal";
      const fontId = getFontInfoId(font);
      const relativePath = fontPaths.fontMap[fontId];

      if (!relativePath) {
        throw new Error(
          `Font not found in map: ${fontId}\n` +
            `Font: ${font.fontFamily} (weight: ${font.weight}, italic: ${font.italic})\n` +
            `Regenerate font map: fontconvert ./public/fonts --output-map=./src/generated/font-map.json`,
        );
      }

      const fontPath = `${fontPaths.basePath}/${relativePath}`;

      await checkFontFileExists(fontPath, font);

      pdf.addFont(fontPath, font.fontFamily, fontStyle, String(font.weight));

      // Inject kerning and width data for proper text spacing
      injectKerningIntoJsPdf(
        pdf,
        fontId,
        font.fontFamily,
        fontStyle,
        String(font.weight),
      );
    }
  }

  const rc = new PdfRenderContext(pdf, ctx, createCanvasFn);
  return { pdf, rc };
}

async function checkFontFileExists(
  fontPath: string,
  font: { fontFamily: string; weight: number; italic: boolean },
): Promise<void> {
  try {
    const response = await fetch(fontPath, { method: "HEAD" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: Font file not found`);
    }

    const contentType = response.headers.get("Content-Type");
    if (
      contentType &&
      !contentType.includes("font/ttf") &&
      !contentType.includes("application/octet-stream")
    ) {
      throw new Error(
        `Wrong content type: ${contentType}. Server may be serving .woff file instead of .ttf`,
      );
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    throw new Error(
      `PDF generation requires .ttf font files, but ${fontPath} is not available.\n\n` +
        `Font needed: ${font.fontFamily} (weight: ${font.weight}, italic: ${font.italic})\n` +
        `Looking for: ${fontPath}\n` +
        `Error: ${errorMsg}\n\n` +
        `If you only have .woff fonts, you need to:\n` +
        `1. Convert .woff to .ttf (or obtain .ttf versions)\n` +
        `2. Place the .ttf files in your public/fonts directory\n` +
        `3. Ensure they are accessible at the path: ${fontPath}\n\n` +
        (fontPath.includes("/fonts/Inter-")
          ? `For Inter font, download .ttf files from: https://github.com/rsms/inter/releases\n`
          : fontPath.includes("/fonts/National")
          ? `For National 2 font, you need the .ttf versions from your font vendor.\n`
          : ""),
    );
  }
}
