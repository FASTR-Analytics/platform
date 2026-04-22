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
// 1. Fill missing top-level fields: prerequisites, lastScriptUpdate, dataSources, etc.
// 2. Fill metricId and sortOrder in defaultPresentationObjects items
// 3. DELETE metrics from blob (metrics are stored in metrics table, not blob)
// 4. Convert createTableStatementPossibleColumns: empty/null/undefined → false, array → Record
//
// =============================================================================

import { moduleDefinitionInstalledSchema } from "lib";
import type { Sql } from "postgres";

export type MigrationStats = {
  rowsChecked: number;
  rowsTransformed: number;
};

function transformModuleDefinition(mod: Record<string, unknown>): void {
  // Block 1: Fill missing top-level fields
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

  // Block 2: Fill metricId and sortOrder in defaultPresentationObjects items
  if (Array.isArray(mod.defaultPresentationObjects)) {
    const dpos = mod.defaultPresentationObjects as Record<string, unknown>[];
    for (let i = 0; i < dpos.length; i++) {
      const dpo = dpos[i];
      if (!("metricId" in dpo)) dpo.metricId = "";
      if (!("sortOrder" in dpo)) dpo.sortOrder = i;
    }
  }

  // Block 3: DELETE metrics from blob (stored in metrics table, not here)
  delete mod.metrics;

  // Block 4: Convert createTableStatementPossibleColumns in resultsObjects
  //   - empty/null/undefined → false
  //   - array of {colName, colType, notNull} → Record<string, string>
  if (Array.isArray(mod.resultsObjects)) {
    const ros = mod.resultsObjects as Record<string, unknown>[];
    for (const ro of ros) {
      const cols = ro.createTableStatementPossibleColumns;
      if (cols === undefined || cols === null) {
        ro.createTableStatementPossibleColumns = false;
      } else if (Array.isArray(cols)) {
        if (cols.length === 0) {
          ro.createTableStatementPossibleColumns = false;
        } else {
          const newCols: Record<string, string> = {};
          for (const col of cols as { colName: string; colType: string; notNull?: boolean }[]) {
            newCols[col.colName] = col.notNull ? `${col.colType} NOT NULL` : col.colType;
          }
          ro.createTableStatementPossibleColumns = newCols;
        }
      } else if (typeof cols === "object" && Object.keys(cols as object).length === 0) {
        ro.createTableStatementPossibleColumns = false;
      }
    }
  }
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
