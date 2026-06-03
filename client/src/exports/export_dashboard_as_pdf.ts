import {
  deduplicateFonts,
  type FontInfo,
  getFontsForPage,
  pagesToPdfBrowser,
} from "panther";
import { type APIResponseNoData, getAllSlideFontVariants } from "lib";
import fontMap from "~/font-map.json";
import {
  type DashboardExportModel,
  sanitizeFilename,
} from "./_dashboard_export_model";
import {
  buildDashboardPages,
  type DashboardPagesOpts,
  exportFilenameBasis,
} from "./_dashboard_pages";

// A4 portrait DU frame (matches the report PDF export).
const PDF_PAGE_WIDTH = 1000;
const PDF_PAGE_HEIGHT = 1414;

export async function exportDashboardAsPdf(
  model: DashboardExportModel,
  opts: DashboardPagesOpts,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const pages = await buildDashboardPages(model, opts, (frac) =>
      progress(0.05 + 0.6 * frac),
    );

    progress(0.7);
    // Vector figures need their real fonts registered; getFontsForPage walks
    // each page's figure styles, plus an International Inter baseline for page
    // chrome (header/title/markdown). An unmapped font throws here — caught below.
    const fonts: FontInfo[] = deduplicateFonts([
      ...getAllSlideFontVariants("International Inter"),
      ...pages.flatMap(getFontsForPage),
    ]);

    const pdf = await pagesToPdfBrowser(
      pages,
      PDF_PAGE_WIDTH,
      PDF_PAGE_HEIGHT,
      fonts,
      { basePath: "/fonts", fontMap: fontMap.ttf },
    );

    progress(0.97);
    pdf.save(`${sanitizeFilename(exportFilenameBasis(model))}.pdf`);
    progress(1);
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const friendly = msg.includes("Font not found in map")
      ? "A chart uses a font that isn't available for PDF export. " + msg
      : msg;
    return {
      success: false,
      err: "Error exporting dashboard PDF: " + friendly,
    };
  }
}
