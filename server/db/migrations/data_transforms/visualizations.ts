// =============================================================================
// DATA TRANSFORM: visualizations.bundle
// =============================================================================
//
// Table:    visualizations (bumps the owning products.last_updated)
// Column:   bundle (JSON)
// Schema:   lib/types/_figure_bundle.ts → figureBundleSchema
//
// The startup validation sweep that lets runtime trust the database. A
// visualization's bundle is one stored figure, so it gets the figure-block
// transforms slides and reports share (embedded PO config renames, declared
// formats): without them the re-parse (Zod strip mode) would silently delete
// a legacy key instead of migrating it. Rows are never pre-bundle, so the
// legacy-source upgrade does not apply. A later change to the visualization
// DOC shape must also null visualizations.crdt_state (S16).
//
// =============================================================================

import { figureBundleSchema } from "lib";
import type { Sql } from "postgres";
import { visualizationResolvedPair } from "../../products/visualizations.ts";
import {
  type MigrationStats,
  rawJsonNeedsForcedTransform,
} from "./po_config.ts";
import {
  type FigureBlockMut,
  rawJsonNeedsFigureBlockTransform,
  transformFigureBlock,
} from "./_figure_block.ts";

export async function migrateVisualizations(
  tx: Sql,
  _countryIso3: string,
): Promise<MigrationStats> {
  const rows = await tx<{ id: string; bundle: string }[]>`
    SELECT id, bundle FROM visualizations
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const bundle = JSON.parse(row.bundle);

    // Already valid? Skip: unless legacy keys (which safeParse silently
    // strips) still need a transform (the Skip-Gate Gotcha).
    if (
      figureBundleSchema.safeParse(bundle).success &&
      !rawJsonNeedsForcedTransform(row.bundle) &&
      !rawJsonNeedsFigureBlockTransform(row.bundle)
    ) {
      continue;
    }
    const storedCanonical = JSON.stringify(bundle);

    const block: FigureBlockMut = { type: "figure", bundle };
    transformFigureBlock(block);

    // Throws if the row is still invalid after every transform: the runner
    // then refuses to start the server.
    const parsed = figureBundleSchema.parse(block.bundle);
    const validated = JSON.stringify(parsed);

    // Output identical to stored (a forced-scan false positive)? Skip the
    // write so the row doesn't churn last_updated on every boot.
    if (validated === storedCanonical) {
      continue;
    }

    await tx`
      UPDATE visualizations
      SET ${tx({ bundle: validated, ...visualizationResolvedPair(parsed) })}
      WHERE id = ${row.id}
    `;
    await tx`UPDATE products SET last_updated = ${now} WHERE id = ${row.id}`;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
