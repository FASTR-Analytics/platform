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
  REFERENCE_WIDTH_DU,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";
import type { ExportSizeOptions } from "./write_figure.ts";

export async function writeSlide(
  filePath: string,
  inputs: PageInputs,
  opts: ExportSizeOptions,
): Promise<void> {
  if (!inputs) {
    throw new Error("Slide inputs are required");
  }

  const canvas = await getSlideAsCanvas(
    inputs,
    opts.outputWidthPx,
    opts.outputHeightPx,
  );
  writeCanvas(filePath, canvas);
}

export async function writeSlides(
  dirPath: string,
  inputs: PageInputs[],
  opts: ExportSizeOptions,
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
      opts.outputHeightPx,
      i + 1,
    );
    writeCanvas(filePath, canvas);
  }
}

async function getSlideAsCanvas(
  inputs: PageInputs,
  outputWidthPx: number,
  outputHeightPx?: number,
  slideNumber?: number,
): Promise<Canvas> {
  // Register fonts
  const fonts = new CustomPageStyle(inputs.style).getFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }

  const devicePxPerDu = getExportDevicePxPerDu(outputWidthPx);

  // Pages are always laid out zoom at the reference frame width.
  let frameHDu: number;
  if (outputHeightPx === undefined) {
    const { rc } = createCanvasRenderContext(REFERENCE_WIDTH_DU, 100);
    frameHDu =
      PageRenderer.getIdealHeight(rc, REFERENCE_WIDTH_DU, inputs).idealH;
  } else {
    frameHDu = outputHeightPx / devicePxPerDu;
  }

  const backingW = Math.round(REFERENCE_WIDTH_DU * devicePxPerDu); // === outputWidthPx
  const backingH = Math.round(frameHDu * devicePxPerDu);

  const { canvas, rc } = createCanvasRenderContext(backingW, backingH);
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(devicePxPerDu, 0, 0, devicePxPerDu, 0, 0);
  const rcd = new RectCoordsDims([0, 0, REFERENCE_WIDTH_DU, frameHDu]);

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
