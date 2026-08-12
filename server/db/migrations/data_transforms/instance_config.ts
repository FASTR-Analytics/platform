// =============================================================================
// DATA TRANSFORM: instance_config.config_json_value
//                 (structure_schema_hmis / structure_schema_hfa)
// =============================================================================
//
// Table:    instance_config
// Column:   config_json_value (JSON)
// Schema:   lib/types/instance.ts
//           → structureSchemaSchema
//
// HOW THIS WORKS:
// - Runs at startup in a transaction (on main database, not per-project)
// - For each config row: validate against current schema
// - If valid: skip (no work needed)
// - If invalid: apply transform blocks, validate, write
// - If any row fails validation after transforms: rollback, boot fails
//
// Runs AFTER the SQL migrations, so on the deploy that ships migration 076 it
// validates 076's per-family copy output on the same boot.
//
// TRANSFORM BLOCKS:
// 1. Fill all missing include* boolean fields with false (carried over from
//    the legacy facility_columns sweep: an instance jumping several versions
//    can have 076 copy a pre-flags facility_columns row verbatim)
//
// =============================================================================

import { structureSchemaSchema } from "lib";
import type { Sql } from "postgres";
import type { MigrationStats } from "./po_config.ts";

export type { MigrationStats };

function transformStructureSchema(config: Record<string, unknown>): void {
  // Block 1: Fill all missing include* boolean fields with false
  if (!("includeNames" in config)) config.includeNames = false;
  if (!("includeTypes" in config)) config.includeTypes = false;
  if (!("includeOwnership" in config)) config.includeOwnership = false;
  if (!("includeCustom1" in config)) config.includeCustom1 = false;
  if (!("includeCustom2" in config)) config.includeCustom2 = false;
  if (!("includeCustom3" in config)) config.includeCustom3 = false;
  if (!("includeCustom4" in config)) config.includeCustom4 = false;
  if (!("includeCustom5" in config)) config.includeCustom5 = false;
}

export async function migrateInstanceConfigs(tx: Sql): Promise<MigrationStats> {
  const rows = await tx<{ config_key: string; config_json_value: string }[]>`
    SELECT config_key, config_json_value FROM instance_config
    WHERE config_key IN ('structure_schema_hmis', 'structure_schema_hfa')
  `;
  let rowsTransformed = 0;

  for (const row of rows) {
    const config = JSON.parse(row.config_json_value);

    // Already valid? Skip.
    if (structureSchemaSchema.safeParse(config).success) {
      continue;
    }

    // Deep clone to avoid mutating original
    const transformed = structuredClone(config) as Record<string, unknown>;

    // Apply transforms
    transformStructureSchema(transformed);

    // Validate against current schema — throws if invalid
    const validated = structureSchemaSchema.parse(transformed);

    // Write back
    await tx`
      UPDATE instance_config
      SET config_json_value = ${JSON.stringify(validated)}
      WHERE config_key = ${row.config_key}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
