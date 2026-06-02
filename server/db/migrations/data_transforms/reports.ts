// =============================================================================
// DATA TRANSFORM: reports.config / reports.figures / reports.images
// =============================================================================
//
// Table:    reports
// Columns:  config, figures, images (JSON)
// Schemas:  lib/types/reports.ts
//           → reportConfigSchema, reportFiguresSchema, reportImagesSchema
//
// New table (v1) — no legacy shapes yet, so this is the startup validation
// sweep that lets runtime trust the database. Add transform blocks here (in
// order, idempotent) when a stored shape changes.
//
// =============================================================================

import {
  reportConfigSchema,
  reportFiguresSchema,
  reportImagesSchema,
} from "lib";
import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

export async function migrateReports(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  const rows = await tx<
    { id: string; config: string | null; figures: string; images: string }[]
  >`
    SELECT id, config, figures, images FROM reports
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = row.config ? JSON.parse(row.config) : {};
    const figures = JSON.parse(row.figures);
    const images = JSON.parse(row.images);

    // Already valid? Skip.
    if (
      reportConfigSchema.safeParse(config).success &&
      reportFiguresSchema.safeParse(figures).success &&
      reportImagesSchema.safeParse(images).success
    ) {
      continue;
    }

    // (No transform blocks yet — new table. Add them above this line when a
    //  stored shape changes, then the validation below catches regressions.)

    const validated = {
      config: JSON.stringify(reportConfigSchema.parse(config)),
      figures: JSON.stringify(reportFiguresSchema.parse(figures)),
      images: JSON.stringify(reportImagesSchema.parse(images)),
    };

    await tx`
      UPDATE reports
      SET config = ${validated.config},
          figures = ${validated.figures},
          images = ${validated.images},
          last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
