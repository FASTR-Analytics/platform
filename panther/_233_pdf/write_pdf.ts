// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createCanvas,
  CustomPageStyle,
  type jsPDF,
  markdownToPages,
  type PageInputs,
  PageRenderer,
  PdfRenderContext,
  RectCoordsDims,
  registerFontWithSkiaIfNeeded,
  validateFilePath,
} from "./deps.ts";
import { registerFontWithJsPdfIfNeeded } from "./register_font.ts";

export async function writePdf(
  filePath: string,
  inputs: PageInputs[] | string,
  w: number,
  h: number,
): Promise<void> {
  // Convert markdown to PageInputs if necessary
  const PageInputs = typeof inputs === "string"
    ? markdownToPages(inputs)
    : inputs;

  // Validate inputs
  if (!PageInputs || PageInputs.length === 0) {
    throw new Error("At least one slide input is required");
  }

  validateFilePath(filePath);

  // Dynamic import of jsPDF
  const { jsPDF } = await import("jspdf");

  // Determine orientation once
  const orientation = w > h ? "landscape" : "portrait";

  // Create PDF with dimensions
  const pdf = new jsPDF({
    orientation,
    unit: "px",
    format: [w, h],
    compress: true,
  }) as jsPDF;

  // Create canvas for text measurement
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d") as any;

  // Process each slide
  for (let i = 0; i < PageInputs.length; i++) {
    // Add new page for subsequent slides
    if (i > 0) {
      pdf.addPage([w, h], orientation);
    }

    // Create render context
    const rc = new PdfRenderContext(pdf, ctx, createCanvas);
    const rcd = new RectCoordsDims([0, 0, w, h]);

    // Register fonts for this slide (lazy registration with caching)
    const fonts = new CustomPageStyle(
      PageInputs[i].style,
    ).getMergedPageFontsToRegister();

    for (const font of fonts) {
      await registerFontWithSkiaIfNeeded(font);
      registerFontWithJsPdfIfNeeded(pdf, font);
    }

    const mSlide = await PageRenderer.measure(rc, rcd, PageInputs[i]);

    // Check for warnings from layout measurement
    if (mSlide.warnings.length > 0) {
      console.warn(`Slide ${i + 1} layout warnings:`);
      for (const warning of mSlide.warnings) {
        console.warn(
          `  - ${warning.type}: ${warning.message}${
            warning.path ? ` (at ${warning.path})` : ""
          }`,
        );
      }
    }

    await PageRenderer.render(rc, mSlide);
  }

  // Save PDF
  pdf.save(filePath);
}
