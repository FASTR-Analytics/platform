import { type APIResponseWithData, emailAttachmentFilename } from "lib";
import { serverActions } from "~/server_actions";
import { buildReportPdfFromDetail } from "./export_report_as_paged_pdf";

// The file "Email this file" attaches: the report's real paged PDF (the
// editor's pages, printed by the server), the same bytes Download saves.
export type ReportAttachment = {
  content: string;
  filename: string;
  mimeType: "application/pdf" | "text/html";
};

export async function buildReportAttachment(
  productId: string,
  progress: (pct: number) => void,
): Promise<APIResponseWithData<ReportAttachment>> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);
    const res = await serverActions.getReportDetail({
      product_id: productId,
    });
    if (!res.success) return res;
    const detail = res.data;
    const pdf = await buildReportPdfFromDetail(
      detail,
      (v) => progress(0.05 + v * 0.95),
    );
    if (!pdf.success) return pdf;
    return {
      success: true,
      data: {
        content: pdf.data.base64,
        filename: emailAttachmentFilename(detail.label, "pdf"),
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
