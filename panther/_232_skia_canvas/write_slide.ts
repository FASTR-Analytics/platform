// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Canvas,
  CustomPageStyle,
  type PageInputs,
  PageRenderer,
} from "./deps.ts";
import { registerFontWithSkiaIfNeeded } from "./register_font.ts";
import { createCanvasRenderContext, writeCanvas } from "./utils.ts";

export async function writeSlide(
  filePath: string,
  inputs: PageInputs,
  w: number,
  h: number | undefined,
): Promise<void> {
  // Validate inputs
  if (!inputs) {
    throw new Error("Slide inputs are required");
  }

  const canvas = await getSlideAsCanvas(inputs, w, h);
  writeCanvas(filePath, canvas);
}

export async function writeSlides(
  dirPath: string,
  inputs: PageInputs[],
  w: number,
  h: number,
): Promise<void> {
  // Validate inputs
  if (!inputs) {
    throw new Error("Slide inputs are required");
  }

  // Determine padding based on total number of slides
  const padLength = inputs.length > 99 ? 3 : 2;

  // Write each slide
  for (let i = 0; i < inputs.length; i++) {
    const slideNumber = String(i + 1).padStart(padLength, "0");
    const filePath = `${dirPath}/slide_${slideNumber}.png`;
    const canvas = await getSlideAsCanvas(inputs[i], w, h, i + 1);
    writeCanvas(filePath, canvas);
  }
}

async function getSlideAsCanvas(
  inputs: PageInputs,
  w: number,
  h: number | undefined,
  slideNumber?: number,
): Promise<Canvas> {
  // Register fonts
  const fonts = new CustomPageStyle(inputs.style).getFontsToRegister();
  for (const font of fonts) {
    await registerFontWithSkiaIfNeeded(font);
  }

  let finalH: number;

  if (h === undefined) {
    const { rc } = await createCanvasRenderContext(w, 100);
    finalH = await PageRenderer.getIdealHeight(rc, w, inputs);
  } else {
    finalH = h;
  }

  const { canvas, rc, rcd } = await createCanvasRenderContext(w, finalH);
  const mSlide = await PageRenderer.measure(rc, rcd, inputs);

  // Check for warnings from layout measurement
  if (mSlide.warnings.length > 0) {
    const slideLabel = slideNumber !== undefined
      ? `Slide ${slideNumber}`
      : "Slide";
    console.warn(`${slideLabel} layout warnings:`);
    for (const warning of mSlide.warnings) {
      console.warn(
        `  - ${warning.type}: ${warning.message}${
          warning.path ? ` (at ${warning.path})` : ""
        }`,
      );
    }
  }

  await PageRenderer.render(rc, mSlide);
  return canvas;
}
