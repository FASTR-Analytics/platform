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
import { type MigrationStats, rawJsonNeedsForcedTransform } from "./po_config.ts";
import { type FigureBlockMut, transformFigureBlock } from "./_figure_block.ts";

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

    // Already valid? Skip — unless legacy keys (which safeParse silently
    // strips) still need the embedded-config rename.
    if (
      reportConfigSchema.safeParse(config).success &&
      reportFiguresSchema.safeParse(figures).success &&
      reportImagesSchema.safeParse(images).success &&
      !rawJsonNeedsForcedTransform(row.figures)
    ) {
      continue;
    }
    const storedCanonical = {
      config: JSON.stringify(config),
      figures: JSON.stringify(figures),
      images: JSON.stringify(images),
    };

    // Block 1: Figure-block transforms shared with slides/dashboards — embedded
    // PO config, source.type rename, figureInputs normalization. Repairs a
    // report figure whose embedded config drifted under a po_config change.
    // (figureInputs itself is z.unknown() in figureBlockSchema, so the skip gate
    // above can't see pure figureInputs drift; a future panther figureInputs
    // change needs a force block here, à la slide_config.ts PRE-VALIDATION A.)
    if (figures && typeof figures === "object") {
      for (const block of Object.values(figures)) {
        transformFigureBlock(block as FigureBlockMut);
      }
    }

    const validated = {
      config: JSON.stringify(reportConfigSchema.parse(config)),
      figures: JSON.stringify(reportFiguresSchema.parse(figures)),
      images: JSON.stringify(reportImagesSchema.parse(images)),
    };

    // Output identical to stored (e.g. a forced-scan false positive)? Skip the
    // write so the row doesn't churn last_updated on every boot.
    if (
      validated.config === storedCanonical.config &&
      validated.figures === storedCanonical.figures &&
      validated.images === storedCanonical.images
    ) {
      continue;
    }

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
