// =============================================================================
// Paged report PDF: prints a complete, self-contained report document with
// headless Chrome. The document arrives from the CLIENT already laid out for
// paper, and the printer (one shared browser, one render at a time, closed
// when idle) is Report Forge's: report-forge/server/renderer.ts. This module
// binds it to the instance's Chrome and to the API response shape.
// =============================================================================

import type { APIResponseWithData } from "lib";
import {
  createReportPdfRenderer,
  type RenderedReportPdf,
  type ReportPdfRenderer,
} from "../../report-forge/server/mod.ts";
import { _CHROME_PATH } from "../exposed_env_vars.ts";

export type { RenderedReportPdf };

let renderer: ReportPdfRenderer | undefined;

// Whether this instance can render at all: the client shows a plain message
// instead of a failed progress bar when it cannot.
export function canRenderReportPdf(): boolean {
  return _CHROME_PATH !== undefined && _CHROME_PATH.length > 0;
}

// Render one document to a PDF.
export async function renderReportPdf(
  html: string,
  progress: (pct: number, message: string) => Promise<void>,
): Promise<APIResponseWithData<RenderedReportPdf>> {
  try {
    if (_CHROME_PATH === undefined || _CHROME_PATH.length === 0) {
      throw new Error(
        "This instance cannot render PDFs: CHROME_PATH is not configured.",
      );
    }
    renderer ??= createReportPdfRenderer({ chromePath: _CHROME_PATH });
    return { success: true, data: await renderer.render(html, progress) };
  } catch (e) {
    return {
      success: false,
      err: "Error rendering the report PDF: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
