import { markdownToPdfBrowser } from "panther";
import type { APIResponseNoData } from "lib";
import { serverActions } from "~/server_actions";
import fontMap from "~/font-map.json";
import { buildReportFigureMap, buildReportImageMap } from "./_report_export_maps";

// A4 portrait DU frame (1000 wide × ~1.414 → 1414). Fixed minimal style for v1
// (PLAN_REPORTS.md §10.2). Keep asSlides unset/false (§5 footgun).
const PAGE_WIDTH = 1000;
const PAGE_HEIGHT = 1414;

export async function exportReportAsPdf(
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

    const pdf = await markdownToPdfBrowser(res.data.body, {
      figures,
      images,
      fontPaths: { basePath: "/fonts", fontMap: fontMap.ttf },
      pageWidth: PAGE_WIDTH,
      pageHeight: PAGE_HEIGHT,
      pageNumbers: true,
    });

    progress(1);
    pdf.save(`${res.data.label}.pdf`);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err: "Error exporting report PDF: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
