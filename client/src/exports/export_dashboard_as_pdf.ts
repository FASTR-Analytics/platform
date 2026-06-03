import {
  createItemNode,
  createPdfRenderContextWithFontsBrowser,
  CustomPageStyle,
  type CustomPageStyleOptions,
  deduplicateFonts,
  FigureRenderer,
  type FontInfo,
  type FreeformPageInputs,
  getFontsForPage,
  measureHeaderFooterHeights,
  type PageContentItem,
  PageRenderer,
  RectCoordsDims,
} from "panther";
import {
  type APIResponseNoData,
  getAllSlideFontVariants,
  getSlideFontInfo,
} from "lib";
import fontMap from "~/font-map.json";
import {
  type DashboardExportModel,
  sanitizeFilename,
} from "./_dashboard_export_model";
import {
  exportFilenameBasis,
  placeholderMarkdown,
  prepareFigures,
} from "./_dashboard_pages";

// ── PDF layout — adjust here ────────────────────────────────────────────────
// Pages are PDF_PAGE_WIDTH DU wide (same width as the PPTX slides) and each
// page's HEIGHT is sized to its own figure, so nothing is letterboxed: a wide
// chart yields a short (landscape) page, a tall table a portrait one.
const PDF_PAGE_WIDTH = 1200;
const PDF_PLACEHOLDER_CONTENT_HEIGHT = 200;

// Page header = the figure label; subHeader = the dashboard's About text.
// Tweak the fonts / relative sizes here. Padding comes from panther defaults.
const PDF_PAGE_STYLE: CustomPageStyleOptions = {
  text: {
    header: {
      font: getSlideFontInfo("International Inter", true, false), // weight 800
      relFontSize: 2,
    },
    subHeader: {
      font: getSlideFontInfo("International Inter", false, false), // weight 400
      relFontSize: 1.2,
    },
  },
};

export async function exportDashboardAsPdf(
  model: DashboardExportModel,
  opts: { includeAbout: boolean },
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const prepared = await prepareFigures(model, (frac) =>
      progress(0.05 + 0.5 * frac),
    );

    const subHeader =
      opts.includeAbout && model.summary.trim()
        ? model.summary.trim()
        : undefined;

    const pages: FreeformPageInputs[] = prepared.map((pf) => ({
      type: "freeform",
      header: pf.label,
      subHeader,
      style: PDF_PAGE_STYLE,
      content: createItemNode<PageContentItem>(
        pf.figureInputs ?? { markdown: placeholderMarkdown() },
      ),
    }));

    progress(0.6);
    const fonts: FontInfo[] = deduplicateFonts([
      ...getAllSlideFontVariants("International Inter"),
      ...pages.flatMap(getFontsForPage),
    ]);

    // Temporary initial page; each page is resized to its figure below and the
    // blank first page is dropped at the end (jsPDF fixes page 1 at creation).
    const { pdf, rc } = await createPdfRenderContextWithFontsBrowser(
      PDF_PAGE_WIDTH,
      PDF_PAGE_WIDTH,
      fonts,
      { basePath: "/fonts", fontMap: fontMap.ttf },
    );

    const merged = new CustomPageStyle(PDF_PAGE_STYLE).getMergedFreeformStyle();
    const contentPaddingPy = merged.content.padding.totalPy();
    const contentWidth = PDF_PAGE_WIDTH - merged.content.padding.totalPx();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const headerHeight = measureHeaderFooterHeights(
        rc,
        PDF_PAGE_WIDTH,
        { header: page.header, subHeader: page.subHeader },
        merged,
      ).headerHeight;

      const item = page.content.type === "item" ? page.content.data : undefined;
      const contentHeight =
        item && FigureRenderer.isType(item)
          ? FigureRenderer.getIdealHeight(rc, contentWidth, item).idealH
          : PDF_PLACEHOLDER_CONTENT_HEIGHT;

      const pageHeight = Math.round(
        headerHeight + contentPaddingPy + contentHeight,
      );
      const orientation =
        pageHeight > PDF_PAGE_WIDTH ? "portrait" : "landscape";

      pdf.addPage([PDF_PAGE_WIDTH, pageHeight], orientation);
      const rcd = new RectCoordsDims([0, 0, PDF_PAGE_WIDTH, pageHeight]);
      const measured = await PageRenderer.measure(rc, rcd, page);
      await PageRenderer.render(rc, measured);

      progress(0.6 + 0.35 * ((i + 1) / pages.length));
    }

    // Drop the temporary blank first page.
    pdf.deletePage(1);

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
