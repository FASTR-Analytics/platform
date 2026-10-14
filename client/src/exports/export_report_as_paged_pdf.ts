import { type APIResponseWithData, type ReportDetail } from "lib";
import { buildPagedReportHtml, type ReportPageLayout } from "report-forge";
import { serverActions } from "~/server_actions";
import { reportDocumentOf, reportExportHostOf } from "./export_report_as_html";

export { fastrPagedFooter, type ReportPageLayout } from "report-forge";

// The paged PDF of a report: the paged document is built by Report Forge in
// the browser that owns the rasters, and printed by the server's headless
// Chrome. Download saves the bytes; Email attaches them
// (export_report_attachment.ts).

// The page starts of the report open in the editor, by report id: the
// editor registers what it laid out (with the body it laid out), and the
// export forces those breaks when the body it fetched is that same body,
// so the PDF breaks where the author's page boxes did. Unsaved edits or no
// open editor: Paged.js decides by the same rules.
const pageLayouts = new Map<string, () => ReportPageLayout | undefined>();

export function registerReportPageLayout(
  reportId: string,
  get: () => ReportPageLayout | undefined,
): () => void {
  pageLayouts.set(reportId, get);
  return () => {
    if (pageLayouts.get(reportId) === get) pageLayouts.delete(reportId);
  };
}

function layoutFor(detail: ReportDetail): ReportPageLayout | undefined {
  const layout = pageLayouts.get(detail.id)?.();
  return layout !== undefined && layout.body === detail.body
    ? layout
    : undefined;
}

export type ReportPdfBytes = {
  base64: string;
  filename: string;
  pages: number;
};

// From an already-fetched report (the email attachment has it in hand).
export async function buildReportPdfFromDetail(
  detail: ReportDetail,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportPdfBytes>> {
  try {
    const html = await buildPagedReportHtml(
      reportDocumentOf(detail),
      reportExportHostOf(detail.figures),
      layoutFor(detail),
      (v) => progress(v * 0.5),
    );
    const rendered = await serverActions.renderReportPdf(
      { product_id: detail.id, html },
      (p) => progress(0.5 + Math.max(0, Math.min(1, p)) * 0.5),
    );
    if (!rendered.success) return rendered;
    progress(1);
    return {
      success: true,
      data: {
        base64: rendered.data.pdfBase64,
        filename: `${detail.label}.pdf`,
        pages: rendered.data.pages,
      },
    };
  } catch (e) {
    return {
      success: false,
      err: "Error building the report PDF: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}

export async function buildReportPdfBase64(
  productId: string,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportPdfBytes>> {
  await new Promise((res) => setTimeout(res, 0));
  progress(0.03);
  const res = await serverActions.getReportDetail({
    product_id: productId,
  });
  if (!res.success) return res;
  return buildReportPdfFromDetail(
    res.data,
    (v) => progress(0.03 + v * 0.97),
  );
}
