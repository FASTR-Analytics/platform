import {
  type APIResponseNoData,
  type APIResponseWithData,
  type FastrPagedFooter,
  type ReportDetail,
  t3,
} from "lib";
import { saveAs } from "panther";
import { serverActions } from "~/server_actions";
import { buildStandaloneReportHtml } from "./export_report_as_html";

// The paged PDF of a FASTR Markdown report: the standalone document laid out
// for paper (Paged.js + the paged sheet, fonts inlined) is built HERE, in the
// browser that owns the rasters, and printed by the server's headless Chrome.
// Download saves the bytes; Email attaches them (export_report_attachment.ts).

export function fastrPagedFooter(title: string): FastrPagedFooter {
  return {
    title,
    pageWord: t3({ en: "Page", fr: "Page", pt: "Página" }),
    ofWord: t3({ en: "of", fr: "sur", pt: "de" }),
  };
}

// The page starts of the report open in the editor, by report id: the
// editor registers what it laid out (with the body it laid out), and the
// export forces those breaks when the body it fetched is that same body,
// so the PDF breaks where the author's page boxes did. Unsaved edits or no
// open editor: Paged.js decides by the same rules.
export type ReportPageLayout = {
  body: string;
  pageStarts: number[];
  figureFits: { line: number; height: number }[];
  gapStretches: { line: number; marginTop: number }[];
};
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
  return layout !== undefined && layout.body === detail.body ? layout : undefined;
}

export type ReportPdfBytes = {
  base64: string;
  filename: string;
  pages: number;
};

// From an already-fetched report (the email attachment has it in hand).
export async function buildReportPdfFromDetail(
  projectId: string,
  detail: ReportDetail,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportPdfBytes>> {
  try {
    const html = await buildStandaloneReportHtml(
      detail,
      (v) => progress(v * 0.5),
      {
        paged: {
          footer: fastrPagedFooter(detail.label),
          pageStarts: layoutFor(detail)?.pageStarts,
          figureFits: layoutFor(detail)?.figureFits,
          gapStretches: layoutFor(detail)?.gapStretches,
        },
        inlineFonts: true,
      },
    );
    const rendered = await serverActions.renderReportPdf(
      { projectId, report_id: detail.id, html },
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
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportPdfBytes>> {
  await new Promise((res) => setTimeout(res, 0));
  progress(0.03);
  const res = await serverActions.getReportDetail({
    projectId,
    report_id: reportId,
  });
  if (!res.success) return res;
  return buildReportPdfFromDetail(
    projectId,
    res.data,
    (v) => progress(0.03 + v * 0.97),
  );
}

function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export async function exportReportAsPagedPdf(
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  const res = await buildReportPdfBase64(projectId, reportId, progress);
  if (!res.success) return res;
  saveAs(
    new Blob([base64ToBytes(res.data.base64)], { type: "application/pdf" }),
    res.data.filename,
  );
  return { success: true };
}
