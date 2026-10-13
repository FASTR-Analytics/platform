import type { FastrPagedFooter } from "../../engine/report_fastr_paged.ts";
import { t3 } from "../../engine/i18n.ts";
import {
  buildStandaloneReportHtml,
  type ReportDocument,
  type ReportExportHost,
} from "./standalone_html.ts";

// The paged PDF of a document: the standalone document laid out for paper
// (Paged.js + the paged sheet, fonts inlined) is built HERE, in the browser
// that has the figures, and printed by a headless Chrome the host runs (the
// package's server entry is that printer). This file builds the document;
// the host's `renderPdf` turns it into bytes.

export function fastrPagedFooter(title: string): FastrPagedFooter {
  return {
    title,
    pageWord: t3({ en: "Page", fr: "Page", pt: "Página" }),
    ofWord: t3({ en: "of", fr: "sur", pt: "de" }),
  };
}

// Where the editor put the page breaks, with the body it laid out. An export
// forces these breaks when it prints that same body, so the PDF breaks where
// the author's page boxes did. For any other body, Paged.js decides by the
// same rules.
export type ReportPageLayout = {
  body: string;
  pageStarts: number[];
  paraSplits: { line: number; rows: number[] }[];
  figureFits: { line: number; height: number }[];
  gapStretches: { line: number; marginTop: number }[];
};

// Prints a complete paged document. `onProgress` takes 0 to 1.
export type RenderReportPdf = (
  html: string,
  onProgress: (fraction: number) => void,
) => Promise<Blob>;

// The document a printer is handed: paged, fonts embedded, figures drawn.
export async function buildPagedReportHtml(
  doc: ReportDocument,
  host: ReportExportHost,
  layout: ReportPageLayout | undefined,
  progress: (pct: number) => void,
): Promise<string> {
  const forced = layout !== undefined && layout.body === doc.body
    ? layout
    : undefined;
  return await buildStandaloneReportHtml(doc, host, progress, {
    paged: {
      footer: fastrPagedFooter(doc.title),
      pageStarts: forced?.pageStarts,
      paraSplits: forced?.paraSplits,
      figureFits: forced?.figureFits,
      gapStretches: forced?.gapStretches,
    },
    inlineFonts: true,
  });
}

export async function buildReportPdf(
  doc: ReportDocument,
  host: ReportExportHost,
  layout: ReportPageLayout | undefined,
  renderPdf: RenderReportPdf,
  progress: (pct: number) => void,
): Promise<Blob> {
  const html = await buildPagedReportHtml(
    doc,
    host,
    layout,
    (v) => progress(v * 0.5),
  );
  const pdf = await renderPdf(
    html,
    (p) => progress(0.5 + Math.max(0, Math.min(1, p)) * 0.5),
  );
  progress(1);
  return pdf;
}
