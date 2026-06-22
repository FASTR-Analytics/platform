import { saveAs } from "panther";
import { type APIResponseNoData } from "lib";
import { utils, write } from "xlsx";
import {
  type DashboardExportModel,
  sanitizeFilename,
} from "./_dashboard_export_model";
import { exportFilenameBasis } from "./_dashboard_pages";
import { getTableExportAoa } from "./get_table_export_aoa";

// Excel sheet-name rules: <=31 chars, none of [ ] : * ? / \, non-empty, unique
// within the workbook. Figure labels routinely violate all of these.
function sheetName(label: string, used: Set<string>): string {
  let base = label
    .replace(/[[\]:*?/\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  if (base.length === 0) base = "Sheet";
  let name = base;
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = ` (${n})`;
    name = base.slice(0, 31 - suffix.length) + suffix;
    n++;
  }
  used.add(name.toLowerCase());
  return name;
}

// One sheet per TABLE figure (non-tables skipped, per plan). The model is already
// hydrated, so each sheet's cells match what the dashboard shows on screen.
export async function exportDashboardAsXlsx(
  model: DashboardExportModel,
  progress: (pct: number) => void,
): Promise<APIResponseNoData> {
  try {
    await new Promise((res) => setTimeout(res, 0));
    progress(0.05);

    const wb = utils.book_new();
    const used = new Set<string>();
    const figures = model.figures;
    let appended = 0;

    for (let i = 0; i < figures.length; i++) {
      const fi = figures[i].figureInputs;
      if (fi !== null && "tableData" in fi) {
        try {
          const aoa = getTableExportAoa(fi);
          utils.book_append_sheet(
            wb,
            utils.aoa_to_sheet(aoa),
            sheetName(figures[i].label, used),
          );
          appended++;
        } catch (e) {
          // Skip a malformed table rather than aborting the whole workbook, but
          // log it — a silently dropped sheet would dent the "X of Y" count the
          // modal promised, so make the failure diagnosable.
          console.error(
            `Could not export table "${figures[i].label}" to Excel:`,
            e,
          );
        }
      }
      progress(0.05 + 0.9 * ((i + 1) / figures.length));
    }

    if (appended === 0) {
      return { success: false, err: "No table figures to export." };
    }

    const out = write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const blob = new Blob([out], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    saveAs(blob, `${sanitizeFilename(exportFilenameBasis(model))}.xlsx`);
    progress(1);
    return { success: true };
  } catch (e) {
    return {
      success: false,
      err:
        "Error exporting dashboard Excel: " +
        (e instanceof Error ? e.message : String(e)),
    };
  }
}
