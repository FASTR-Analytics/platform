// =============================================================================
// DATA TRANSFORM: slides.config
// =============================================================================
//
// Table:    slides
// Column:   config (JSON)
// Schema:   lib/types/_slide_config.ts
//           → slideConfigSchema
//
// TRANSFORM BLOCKS: (none yet)
//
// =============================================================================

import { slideConfigSchema } from "../../../../lib/types/_slide_config.ts";
import type { Sql } from "postgres";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

export async function migrateSlideConfigs(tx: Sql, _projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string }[]>`
    SELECT id, config FROM slides
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config);

    // Already valid? Skip.
    if (slideConfigSchema.safeParse(config).success) {
      continue;
    }

    // No transform blocks yet — if we get here, data is invalid
    // Add blocks above this line when schema evolves

    const validated = slideConfigSchema.parse(config);

    await tx`
      UPDATE slides
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
