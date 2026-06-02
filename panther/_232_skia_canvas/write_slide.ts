// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Canvas,
  CustomPageStyle,
  getExportDevicePxPerDu,
  type PageInputs,
  PageRenderer,
  RectCoordsDims,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

// Slide export sizing. A slide renders the page's fixed DU frame
// (pageWidthDu × pageHeightDu) — the same frame the on-screen PageHolder and the
// pdf/pptx exports use. `outputWidthPx` is the file's pixel width (the
// supersample); the pixel height follows the frame aspect.
export type SlideExportSizeOptions = {
  outputWidthPx: number;
  pageWidthDu: number;
  pageHeightDu: number;
};

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

  // Pages are always zoom: lay out in the fixed (pageWidthDu × pageHeightDu)
  // frame. outputWidthPx is the supersample; the backing height follows aspect.
  const devicePxPerDu = getExportDevicePxPerDu(outputWidthPx, pageWidthDu);
  const backingW = Math.round(pageWidthDu * devicePxPerDu); // === outputWidthPx
  const backingH = Math.round(pageHeightDu * devicePxPerDu);

  const { canvas, rc } = createCanvasRenderContext(backingW, backingH);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  const rcd = new RectCoordsDims([0, 0, pageWidthDu, pageHeightDu]);

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
