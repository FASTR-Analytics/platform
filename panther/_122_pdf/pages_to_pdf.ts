// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { jsPDF, PageInputs, RenderContext } from "./deps.ts";
import { PageRenderer, RectCoordsDims } from "./deps.ts";

export async function pagesToPdf(
  pdf: jsPDF,
  rc: RenderContext,
  pages: PageInputs[],
  width: number,
  height: number,
): Promise<jsPDF> {
  if (!pages || pages.length === 0) {
    throw new Error("At least one page is required");
  }

  const rcd = new RectCoordsDims([0, 0, width, height]);

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) {
      pdf.addPage([width, height]);
    }

    const measured = await PageRenderer.measure(rc, rcd, pages[i]);

    if (measured.warnings.length > 0) {
      console.warn(`Page ${i + 1} layout warnings:`);
      for (const warning of measured.warnings) {
        console.warn(
          `  - ${warning.type}: ${warning.message}${
            warning.path ? ` (at ${warning.path})` : ""
          }`,
        );
      }
    }

    await PageRenderer.render(rc, measured);
  }

  return pdf;
}
