// =============================================================================
// DATA TRANSFORM: dashboards.config
// =============================================================================
//
// Table:    dashboards
// Column:   config (JSON)
// Schema:   lib/types/_dashboard_config.ts
//           → dashboardConfigSchema
//
// TRANSFORM BLOCKS (run in order, each is idempotent):
// (none yet — column was introduced with a valid NOT NULL DEFAULT, so every
//  row already validates; future schema changes add `// Block N:` blocks here.)
//
// =============================================================================

import { dashboardConfigSchema } from "lib";
import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

export type { MigrationStats };

export async function migrateDashboardConfigs(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  const rows = await tx<{ id: string; config: string | null }[]>`
    SELECT id, config FROM dashboards
  `;
  const now = new Date().toISOString();
  let rowsTransformed = 0;

  for (const row of rows) {
    if (!row.config) continue;

    const config = JSON.parse(row.config);

    // Already valid? Skip (current-shape).
    if (dashboardConfigSchema.safeParse(config).success) {
      continue;
    }

    // (Future transform blocks go here, numbered and idempotent.)

    const validated = dashboardConfigSchema.parse(config);

    await tx`
      UPDATE dashboards
      SET config = ${JSON.stringify(validated)}, last_updated = ${now}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
