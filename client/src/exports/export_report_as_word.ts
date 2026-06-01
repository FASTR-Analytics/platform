import { markdownToWordBrowser, saveAs } from "panther";
import { Packer } from "docx";
import type { APIResponseNoData } from "lib";
import { serverActions } from "~/server_actions";
import { buildReportFigureMap, buildReportImageMap } from "./_report_export_maps";

export async function exportReportAsWord(
  projectId: string,
  reportId: string,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const res = await serverActions.getReportDetail({
      projectId,
      report_id: reportId,
    });
    if (!res.success) return res;

    progress(0.2);
    const figures = await buildReportFigureMap(res.data.figures);
    progress(0.5);
    const images = await buildReportImageMap(res.data.images);
    progress(0.7);

    // markdownToWordBrowser rasterizes figures internally (FigureMap of
    // FigureInputs); we pass hydrated inputs + the image map.
    const doc = await markdownToWordBrowser(res.data.body, { figures, images });
    const blob = await Packer.toBlob(doc);

    progress(1);
    saveAs(blob, `${res.data.label}.docx`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting report Word: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
