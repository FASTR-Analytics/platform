// =============================================================================
// DATA TRANSFORM: slide_decks.config
// =============================================================================
//
// Table:    slide_decks
// Column:   config (JSON)
// Schema:   lib/types/_slide_deck_config.ts
//           → slideDeckConfigSchema
//
// TRANSFORM BLOCKS:
// 1. Fill primaryColor default
//
// =============================================================================

import { slideDeckConfigSchema, _GFF_GREEN } from "lib";
import type { Sql } from "postgres";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

export async function migrateSlideDeckConfigs(tx: Sql, _projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string | null }[]>`
    SELECT id, config FROM slide_decks
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    if (!row.config) continue;

    const config = JSON.parse(row.config);

    // Already valid? Skip.
    if (slideDeckConfigSchema.safeParse(config).success) {
      continue;
    }

    // Block 1: Fill primaryColor default
    if (!("primaryColor" in config)) {
      config.primaryColor = _GFF_GREEN;
    }

    const validated = slideDeckConfigSchema.parse(config);

    await tx`
      UPDATE slide_decks
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
