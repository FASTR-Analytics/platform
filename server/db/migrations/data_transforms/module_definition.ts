// =============================================================================
// DATA TRANSFORM: modules.module_definition
// =============================================================================
//
// Table:    modules
// Column:   module_definition (JSON)
// Schema:   lib/types/_module_definition_installed.ts
//           → moduleDefinitionInstalledSchema
//
// HOW THIS WORKS:
// - Runs at startup in a transaction
// - For each row: validate against current schema
// - If valid: skip (no work needed)
// - If invalid: apply transform blocks, validate, write
// - If any row fails validation after transforms: rollback, boot fails
//
// TRANSFORM BLOCKS:
// - Fill missing top-level fields: prerequisites, lastScriptUpdate, dataSources, etc.
// - DELETE metrics from blob (metrics are stored in metrics table, not blob)
//
// =============================================================================

import { moduleDefinitionInstalledSchema } from "lib";
import type { Sql } from "postgres";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

function transformModuleDefinition(mod: Record<string, unknown>): void {
  // Fill missing top-level fields
  if (!("prerequisites" in mod)) mod.prerequisites = [];
  if (!("lastScriptUpdate" in mod)) mod.lastScriptUpdate = "";
  if (!("dataSources" in mod)) mod.dataSources = [];
  if (!("scriptGenerationType" in mod)) mod.scriptGenerationType = "template";
  if (!("configRequirements" in mod)) {
    mod.configRequirements = { parameters: [] };
  } else if (mod.configRequirements && typeof mod.configRequirements === "object") {
    const cr = mod.configRequirements as Record<string, unknown>;
    if (!("parameters" in cr)) cr.parameters = [];
  }
  if (!("script" in mod)) mod.script = "";
  if (!("assetsToImport" in mod)) mod.assetsToImport = [];
  if (!("resultsObjects" in mod)) mod.resultsObjects = [];
  if (!("defaultPresentationObjects" in mod)) mod.defaultPresentationObjects = [];

  // DELETE metrics from blob — they're stored in the metrics table, not here
  delete mod.metrics;
}

export async function migrateModuleDefinitions(tx: Sql, _projectId: string): Promise<MigrationStats> {
  const rows = await tx<{ id: string; module_definition: string }[]>`
    SELECT id, module_definition FROM modules
  `;
  let rowsTransformed = 0;

  for (const row of rows) {
    const modDef = JSON.parse(row.module_definition);

    // Already valid? Skip.
    if (moduleDefinitionInstalledSchema.safeParse(modDef).success) {
      continue;
    }

    // Deep clone to avoid mutating original
    const transformed = structuredClone(modDef) as Record<string, unknown>;

    // Apply transforms
    transformModuleDefinition(transformed);

    // Validate against current schema — throws if invalid
    const validated = moduleDefinitionInstalledSchema.parse(transformed);

    // Write only the blob — no timestamp update (this is a schema migration, not
    // a real module update). No cache invalidation needed (modules aren't cached).
    await tx`
      UPDATE modules
      SET module_definition = ${JSON.stringify(validated)}
      WHERE id = ${row.id}
    `;
    rowsTransformed++;
  }

  return { rowsChecked: rows.length, rowsTransformed };
}
