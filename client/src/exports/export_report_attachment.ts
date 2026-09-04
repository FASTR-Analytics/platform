import { jsPDF } from "jspdf";
import { markdownToPdfBrowser } from "panther";
import {
  type APIResponseWithData,
  getReportFormat,
  readFastrDocumentSettings,
  reportRendersAsHtml,
} from "lib";
import { serverActions } from "~/server_actions";
import fontMap from "~/font-map.json";
import { buildReportFigureMap, buildReportImageMap } from "./_report_export_maps";
import { replaceUnavailableMediaTokens } from "./_media_placeholder";
import { REPORT_MARKDOWN_STYLE } from "~/components/report/report_markdown_style";
import { buildStandaloneReportHtml } from "./export_report_as_html";
import { rasterizeReportPages } from "./rasterize_report_document";

// The file "Email this file" attaches: a PDF, whatever the format. A markdown
// report goes through panther's vector renderer as Download does; html and
// fastr reports have no vector path (their PDF is the browser's print dialog,
// which cannot hand a file back), so the rendered document is rasterized page
// by page and those pages become the PDF.
export type ReportAttachment = {
  content: string;
  filename: string;
  mimeType: "application/pdf" | "text/html";
};

const PAGE_WIDTH = 1000;
const PAGE_HEIGHT = 1414;

export async function buildReportAttachment(
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportAttachment>> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const res = await serverActions.getReportDetail({
      projectId,
      report_id: reportId,
    });
    if (!res.success) return res;
    const detail = res.data;
    if (reportRendersAsHtml(getReportFormat(detail.config))) {
      const html = await buildStandaloneReportHtml(detail, (v) => progress(0.05 + v * 0.4));
      const page = getReportFormat(detail.config) === "fastr"
        ? readFastrDocumentSettings(detail.body).page
        : { size: "a4" as const, orientation: "portrait" as const, margin: "normal" as const };
      const raster = await rasterizeReportPages(html, page, (v) => progress(0.45 + v * 0.45));
      if (raster.success === false) return raster;
      const { pages, pageWidthPt, pageHeightPt, marginPt } = raster.data;
      if (pages.length === 0) throw new Error("the report rendered no pages");
      const pdf = new jsPDF({
        unit: "pt",
        format: [pageWidthPt, pageHeightPt],
        orientation: pageWidthPt > pageHeightPt ? "landscape" : "portrait",
        compress: true,
      });
      const contentW = pageWidthPt - marginPt * 2;
      pages.forEach((dataUrl, i) => {
        if (i > 0) pdf.addPage([pageWidthPt, pageHeightPt]);
        const props = pdf.getImageProperties(dataUrl);
        const h = (props.height / props.width) * contentW;
        pdf.addImage(dataUrl, "JPEG", marginPt, marginPt, contentW, h);
      });
      progress(1);
      return {
        success: true,
        data: {
          content: pdf.output("datauristring").split(",")[1],
          filename: `${detail.label}.pdf`,
          mimeType: "application/pdf",
        },
      };
    }
    progress(0.2);
    const figures = await buildReportFigureMap(detail.figures);
    progress(0.5);
    const images = await buildReportImageMap(detail.images);
    progress(0.7);
    const body = replaceUnavailableMediaTokens(detail.body, figures, images);
    const pdf = await markdownToPdfBrowser(body, {
      figures,
      images,
      fontPaths: { basePath: "/fonts", fontMap: fontMap.ttf },
      pageWidth: PAGE_WIDTH,
      pageHeight: PAGE_HEIGHT,
      pageNumbers: true,
      style: { markdown: REPORT_MARKDOWN_STYLE },
    });
    progress(1);
    return {
      success: true,
      data: {
        content: pdf.output("datauristring").split(",")[1],
        filename: `${detail.label}.pdf`,
        mimeType: "application/pdf",
      },
    };
  } catch (e) {
    return {
      success: false,
      err: "Error preparing the report attachment: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
