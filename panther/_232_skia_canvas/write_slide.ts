// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Canvas,
  CustomPageStyle,
  getExportDevicePxPerDu,
  type PageInputs,
  PageRenderer,
  type SlideExportSizeOptions,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

export async function writeSlide(
  filePath: string,
  inputs: PageInputs,
  opts: SlideExportSizeOptions,
): Promise<void> {
  if (!inputs) {
    throw new Error("Slide inputs are required");
  }

  const canvas = await getSlideAsCanvas(
    inputs,
    opts.outputWidthPx,
    opts.pageWidthDu,
    opts.pageHeightDu,
  );
  writeCanvas(filePath, canvas);
}

export async function writeSlides(
  dirPath: string,
  inputs: PageInputs[],
  opts: SlideExportSizeOptions,
): Promise<void> {
  if (!inputs) {
    throw new Error("Slide inputs are required");
  }

  const padLength = inputs.length > 99 ? 3 : 2;

  for (let i = 0; i < inputs.length; i++) {
    const slideNumber = String(i + 1).padStart(padLength, "0");
    const filePath = `${dirPath}/slide_${slideNumber}.png`;
    const canvas = await getSlideAsCanvas(
      inputs[i],
      opts.outputWidthPx,
      opts.pageWidthDu,
      opts.pageHeightDu,
      i + 1,
    );
    writeCanvas(filePath, canvas);
  }
}

async function getSlideAsCanvas(
  inputs: PageInputs,
  outputWidthPx: number,
  pageWidthDu: number,
  pageHeightDu: number,
  slideNumber?: number,
): Promise<Canvas> {
  // Register fonts
  const fonts = new CustomPageStyle(inputs.style).getFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }

  const { canvas, rc, rcd } = createCanvasRenderContext(
    pageWidthDu,
    pageHeightDu,
    getExportDevicePxPerDu(outputWidthPx, pageWidthDu),
  );

  const mSlide = await PageRenderer.measure(rc, rcd, inputs);

  // Check for overflow
  if (mSlide.overflow) {
    const slideLabel = slideNumber !== undefined
      ? `Slide ${slideNumber}`
      : "Slide";
    console.warn(`${slideLabel}: Content exceeds available space`);
  }

  await PageRenderer.render(rc, mSlide);
  return canvas;
}
