// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  defaultTempManager,
  join,
  type PageInputs,
  pagesToPdfDeno,
  type PptxGenJSInstance,
  savePdf,
} from "./deps.ts";
import { pdfToPptxAsImagesDeno } from "./pdf_to_pptx_as_images_deno.ts";

export async function pagesToPptxAsImagesDeno(
  pages: PageInputs[],
  pdfDimensions: { width: number; height: number },
  imageWidth?: number,
): Promise<PptxGenJSInstance> {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const tempDir = await defaultTempManager.createTempDir({
    prefix: "pptx-pdf-",
  });

  try {
    const pdfPath = join(tempDir, "source.pdf");
    const pdf = await pagesToPdfDeno(
      pages,
      pdfDimensions.width,
      pdfDimensions.height,
    );
    savePdf(pdfPath, pdf);

    return await pdfToPptxAsImagesDeno(
      pdfPath,
      imageWidth ?? pdfDimensions.width,
    );
  } finally {
    await defaultTempManager.cleanup(tempDir);
  }
}
