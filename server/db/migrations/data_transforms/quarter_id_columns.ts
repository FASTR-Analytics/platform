// =============================================================================
// DATA TRANSFORM: physical quarter_id columns (ro_* results-object tables)
// =============================================================================
//
// Natively-quarterly results objects store a physical quarter_id column that R
// scripts emit in YYYY0Q (6-digit). This converts already-imported rows to YYYYQ
// (5-digit). The import-normalizer in run_module_iterator.ts handles (re-)runs
// going forward; this covers tables imported before the cutover.
//
// Idempotent: the `>= 100000` guard skips already-5-digit values, so after the
// first boot it is a cheap no-op re-scan.
//
// =============================================================================

import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

export async function migrateQuarterIdColumns(
  tx: Sql,
  _projectId: string,
): Promise<MigrationStats> {
  // Discover ro_* tables carrying a physical quarter_id column.
  const tables = await tx<{ table_name: string }[]>`
    SELECT table_name
    FROM information_schema.columns
    WHERE column_name = 'quarter_id'
      AND LEFT(table_name, 3) = 'ro_'
  `;

  let rowsTransformed = 0;
  for (const { table_name } of tables) {
    const res = await tx.unsafe(
      `UPDATE ${table_name} SET quarter_id = FLOOR(quarter_id / 100) * 10 + (quarter_id % 100) WHERE quarter_id >= 100000`,
    );
    rowsTransformed += (res as { count?: number }).count ?? 0;
  }

  return { rowsChecked: tables.length, rowsTransformed };
}
