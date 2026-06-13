// =============================================================================
// DATA TRANSFORM: dashboard_items.figure_block
// =============================================================================
//
// Table:    dashboard_items
// Column:   figure_block (JSON), geo_data (JSON)
// Schema:   lib/types/_dashboard_config.ts → dashboardFigureBlockSchema
//
// P2: converts old { figureInputs, source } shape → { bundle }. geo_data column
// value is incorporated into the bundle's geo field for map figures; the column
// itself is left intact for now (it becomes redundant but is not dropped here).
//
// =============================================================================

import { dashboardFigureBlockSchema } from "lib";
import type { Sql } from "postgres";
import { type MigrationStats } from "./po_config.ts";
import {
  type FigureBlockMut,
  transformFigureBlock,
  transformFigureBlockToBundle,
  getTransformLocalization,
} from "./_figure_block.ts";

export async function migrateDashboardItems(
  tx: Sql,
  _projectId: string,
  countryIso3: string,
): Promise<MigrationStats> {
  const localization = getTransformLocalization(countryIso3);

  const rows = await tx<{ id: string; figure_block: string; geo_data: string | null }[]>`
    SELECT id, figure_block, geo_data FROM dashboard_items
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const figureBlock = JSON.parse(row.figure_block) as FigureBlockMut;

    if (dashboardFigureBlockSchema.safeParse(figureBlock).success) {
      continue;
    }

    const storedCanonical = JSON.stringify(figureBlock);

    // Step 1: Pre-P2 normalisation (from_metric rename, PO config, header fix).
    transformFigureBlock(figureBlock);

    // Step 2: Convert to bundle format.
    const geoData = row.geo_data ? JSON.parse(row.geo_data) : null;
    transformFigureBlockToBundle(figureBlock, localization, geoData);

    const validated = dashboardFigureBlockSchema.parse(figureBlock);
    const out = JSON.stringify(validated);

    if (out === storedCanonical) continue;

    await tx`
      UPDATE dashboard_items
      SET figure_block = ${out}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
