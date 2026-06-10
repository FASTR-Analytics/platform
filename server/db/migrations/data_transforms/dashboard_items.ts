// =============================================================================
// DATA TRANSFORM: dashboard_items.figure_block
// =============================================================================
//
// Table:    dashboard_items
// Column:   figure_block (JSON)
// Schema:   lib/types/_dashboard_config.ts
//           → dashboardFigureBlockSchema
//
// Every dashboard item — standalone or replicant-group member — is a
// dashboard_items row, so this one sweep covers all dashboard figure blocks
// (dashboard_item_groups holds only group metadata, no figure_block column).
//
// TRANSFORM BLOCKS (run in order, each idempotent):
// 1. Figure-block transforms shared with slides/reports (_figure_block.ts):
//    source.type "from_metric"→"from_data" + snapshotAt, embedded PO config
//    transform, figureInputs normalization.
//
// NOTE: dashboardFigureBlockSchema validates figureInputs against panther's
// zFigureInputs (lib/types figureInputsSchema), so the skip gate sees
// figureInputs drift — old-shape blobs fail the gate and fall through to
// Block 1's figureInputs normalization.
//
// =============================================================================

import { dashboardFigureBlockSchema } from "lib";
import type { Sql } from "postgres";
import {
  type MigrationStats,
  rawJsonNeedsForcedTransform,
} from "./po_config.ts";
import {
  type FigureBlockMut,
  transformFigureBlock,
  warnIfFigureInputsStale,
} from "./_figure_block.ts";

export async function migrateDashboardItems(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  const rows = await tx<{ id: string; figure_block: string }[]>`
    SELECT id, figure_block FROM dashboard_items
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const figureBlock = JSON.parse(row.figure_block);

    // Already valid? Skip (current-shape) — unless legacy keys (which
    // safeParse silently strips) still need the embedded-config rename.
    // figureInputs drift is covered by this same safeParse:
    // dashboardFigureBlockSchema validates figureInputs against panther's
    // zFigureInputs (lib/types figureInputsSchema).
    if (
      dashboardFigureBlockSchema.safeParse(figureBlock).success &&
      !rawJsonNeedsForcedTransform(row.figure_block)
    ) {
      continue;
    }
    const storedCanonical = JSON.stringify(figureBlock);

    // Block 1: Shared figure-block transforms.
    transformFigureBlock(figureBlock as FigureBlockMut);
    warnIfFigureInputsStale(
      `dashboard_items.figure_block row ${row.id}`,
      (figureBlock as FigureBlockMut).figureInputs,
    );

    // Throws if the row is still invalid after every transform (including
    // figureInputs drift the upgrader does not fix) — the runner then refuses
    // to start the server. The warn above names the stale figureInputs.
    const validated = dashboardFigureBlockSchema.parse(figureBlock);

    // Output identical to stored (e.g. a forced-scan false positive)? Skip the
    // write so the row doesn't churn last_updated on every boot.
    const out = JSON.stringify(validated);
    if (out === storedCanonical) {
      continue;
    }

    await tx`
      UPDATE dashboard_items
      SET figure_block = ${out}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
