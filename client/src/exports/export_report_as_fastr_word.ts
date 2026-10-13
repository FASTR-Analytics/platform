import type { APIResponseNoData } from "lib";
import { buildReportWordBlob, saveBlob } from "report-forge";
import { serverActions } from "~/server_actions";
import { reportDocumentOf, reportExportHostOf } from "./export_report_as_html";

// The Word file of a report: built by Report Forge, entirely in the browser
// that draws the figures; the server is asked for the report and nothing else.

export async function exportFastrReportAsWord(
  productId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.03);
    const res = await serverActions.getReportDetail({ product_id: productId });
    if (!res.success) return res;
    const blob = await buildReportWordBlob(
      reportDocumentOf(res.data),
      reportExportHostOf(res.data.figures),
      (v) => progress(0.03 + v * 0.97),
    );
    progress(1);
    saveBlob(blob, `${res.data.label}.docx`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting the report as Word: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
