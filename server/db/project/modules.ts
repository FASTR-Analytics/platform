import { Sql } from "postgres";
import {
  // _ADMIN_SERVER_HOST,
  _INSTANCE_LANGUAGE,
} from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  ModuleDefinitionDetail,
  parseInstalledModuleDefinition,
  getStartingModuleConfigSelections,
  parseJsonOrThrow,
  throwIfErrWithData,
  moduleDefinitionInstalledSchema,
  metricStrict,
  presentationObjectConfigSchema,
  type Metric,
  type ModuleConfigSelections,
  type ModuleId,
} from "lib";
import { getModuleDefinitionDetail } from "../../module_loader/mod.ts";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBModule } from "./_project_database_types.ts";

export function parseModuleConfigSelections(json: string): ModuleConfigSelections {
  const raw = parseJsonOrThrow<Record<string, unknown>>(json);
  return {
    parameterDefinitions: (raw.parameterDefinitions ?? []) as ModuleConfigSelections["parameterDefinitions"],
    parameterSelections: (raw.parameterSelections ?? {}) as ModuleConfigSelections["parameterSelections"],
  };
}

function prepareModuleDefinitionForStorage(mod: ModuleDefinitionDetail): string {
  const { metrics: _, ...rest } = mod;
  const validated = moduleDefinitionInstalledSchema.parse(rest);
  return JSON.stringify(validated);
}

// presentation_objects.metric_id has no FK. Any PO whose metric no longer
// exists in this project is dead (defaults are recreated on install), so purge
// after every operation that changes the metrics table.
async function purgeOrphanedPresentationObjects(sql: Sql): Promise<void> {
  await sql`
DELETE FROM presentation_objects
WHERE metric_id NOT IN (SELECT id FROM metrics)
`;
}

//////////////////////////////////////////////////////////////
//  ______                        __                __  __  //
// /      |                      /  |              /  |/  | //
// $$$$$$/  _______    _______  _$$ |_     ______  $$ |$$ | //
//   $$ |  /       \  /       |/ $$   |   /      \ $$ |$$ | //
//   $$ |  $$$$$$$  |/$$$$$$$/ $$$$$$/    $$$$$$  |$$ |$$ | //
//   $$ |  $$ |  $$ |$$      \   $$ | __  /    $$ |$$ |$$ | //
//  _$$ |_ $$ |  $$ | $$$$$$  |  $$ |/  |/$$$$$$$ |$$ |$$ | //
// / $$   |$$ |  $$ |/     $$/   $$  $$/ $$    $$ |$$ |$$ | //
// $$$$$$/ $$/   $$/ $$$$$$$/     $$$$/   $$$$$$$/ $$/ $$/  //
//                                                          //
//////////////////////////////////////////////////////////////

export async function installModule(
  projectDb: Sql,
  moduleDefinitionId: ModuleId,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    presObjIdsWithNewLastUpdateds: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const modDef = await getModuleDefinitionDetail(
      moduleDefinitionId,
      _INSTANCE_LANGUAGE,
      undefined,
    );
    throwIfErrWithData(modDef);
    const gitRef = modDef.data.gitRef;
    const lastUpdated = new Date().toISOString();

    // Cross-module metric ID conflict check
    const incomingMetricIds = modDef.data.metrics.map((m) => m.id);
    if (incomingMetricIds.length > 0) {
      const conflicting = await projectDb<{ id: string; module_id: string }[]>`
        SELECT id, module_id FROM metrics
        WHERE id = ANY(${incomingMetricIds})
        AND module_id != ${moduleDefinitionId}
      `;
      if (conflicting.length > 0) {
        const conflicts = conflicting.map((c) => `"${c.id}" (in ${c.module_id})`).join(", ");
        throw new Error(`Metric ID conflict: ${conflicts}`);
      }
    }

    const startingConfigSelections = getStartingModuleConfigSelections(
      modDef.data.configRequirements,
    );

    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    const metricIds = modDef.data.metrics.map((m) => m.id);

    await projectDb.begin(async (sql: Sql) => {
      // Delete existing module (cascades to results_objects and metrics)
      await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;

      // Insert module (blob excludes metrics — they're stored in metrics table)
      await sql`
INSERT INTO modules
  (id, module_definition, config_selections, dirty, compute_def_updated_at, compute_def_git_ref, presentation_def_updated_at, presentation_def_git_ref, config_updated_at, last_run_at)
VALUES
  (
    ${modDef.data.id},
    ${prepareModuleDefinitionForStorage(modDef.data)},
    ${JSON.stringify(startingConfigSelections)},
    'queued',
    ${lastUpdated},
    ${gitRef ?? null},
    ${lastUpdated},
    ${gitRef ?? null},
    ${lastUpdated},
    ${lastUpdated}
  )
`;

      // Drop and recreate results object tables, insert into results_objects table
      for (const resultsObject of modDef.data.resultsObjects) {
        const roTableName = getResultsObjectTableName(resultsObject.id);
        await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
        await sql`
INSERT INTO results_objects (id, module_id, column_definitions)
VALUES (
  ${resultsObject.id},
  ${modDef.data.id},
  ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null}
)
`;
      }

      // Insert metrics (validate before write)
      for (const metric of modDef.data.metrics) {
        const validatedMetric = metricStrict.parse(metric);
        await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  results_object_id, ai_description, viz_presets, hide, important_notes
)
VALUES (
  ${validatedMetric.id},
  ${modDef.data.id},
  ${validatedMetric.label},
  ${validatedMetric.variantLabel},
  ${validatedMetric.valueFunc},
  ${validatedMetric.formatAs},
  ${JSON.stringify(validatedMetric.valueProps)},
  ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
  ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
  ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
  ${validatedMetric.resultsObjectId},
  ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
  ${JSON.stringify(validatedMetric.vizPresets)},
  ${validatedMetric.hide},
  ${validatedMetric.importantNotes}
)
`;
      }

      // Delete default presentation objects for this module's metrics
      if (metricIds.length > 0) {
        await sql`
DELETE FROM presentation_objects
WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE
`;
      }
      await purgeOrphanedPresentationObjects(sql);

      // Insert default presentation objects (validate config before write)
      for (const presObjectDef of defaultPresentationObjects) {
        const validatedConfig = presentationObjectConfigSchema.parse(presObjectDef.config);
        // Delete any existing PO with this ID (in case of reinstall)
        await sql`DELETE FROM presentation_objects WHERE id = ${presObjectDef.id}`;
        await sql`
INSERT INTO presentation_objects
  (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
VALUES
  (
    ${presObjectDef.id},
    ${presObjectDef.metricId},
    ${true},
    ${presObjectDef.label},
    ${JSON.stringify(validatedConfig)},
    ${lastUpdated},
    ${presObjectDef.sortOrder}
  )
`;
      }
    });

    // Update last_updated for all presentation objects using this module's metrics
    if (metricIds.length > 0) {
      await projectDb`
UPDATE presentation_objects
SET last_updated = ${lastUpdated}
WHERE metric_id = ANY(${metricIds})
`;
    }

    const allPresObjs = await projectDb<{ id: string }[]>`
SELECT id FROM presentation_objects WHERE metric_id = ANY(${metricIds})
`;
    const presObjIdsWithNewLastUpdateds = allPresObjs.map((po) => po.id);

    return {
      success: true,
      data: { lastUpdated, presObjIdsWithNewLastUpdateds },
    };
  });
}

// Legacy-plane catalog upsert for one module of a wizard generation
// (PLAN_RESULTS_RUNS model point 4 — the dual-write rollback path). Mirrors
// installModule's catalog transaction using the run's resolved definition and
// frozen selections, folded together with the post-run bookkeeping
// setModuleClean writes today (dirty='ready', last_run_at, last_run_git_ref),
// so the previous image serves current data after a rollback. Deliberately
// NOT done here: default presentation objects (a generation never creates
// authored content) and the orphaned-PO purge — under the runs model a metric
// missing from a newer run surfaces as a typed resolution failure against the
// attached manifest, and deleting the user's visualization would destroy
// exactly what that contract promises to keep.
export async function upsertModuleCatalogForGeneratedRun(
  projectDb: Sql,
  modDef: ModuleDefinitionDetail,
  configSelections: ModuleConfigSelections,
  gitRef: string | null,
  lastRunAt: string,
): Promise<void> {
  await projectDb.begin(async (sql: Sql) => {
    await sql`DELETE FROM modules WHERE id = ${modDef.id}`;
    await sql`
INSERT INTO modules
  (id, module_definition, config_selections, dirty, compute_def_updated_at, compute_def_git_ref, presentation_def_updated_at, presentation_def_git_ref, config_updated_at, last_run_at, last_run_git_ref)
VALUES
  (
    ${modDef.id},
    ${prepareModuleDefinitionForStorage(modDef)},
    ${JSON.stringify(configSelections)},
    'ready',
    ${lastRunAt},
    ${gitRef},
    ${lastRunAt},
    ${gitRef},
    ${lastRunAt},
    ${lastRunAt},
    ${gitRef}
  )
`;
    for (const resultsObject of modDef.resultsObjects) {
      const roTableName = getResultsObjectTableName(resultsObject.id);
      await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
      await sql`
INSERT INTO results_objects (id, module_id, column_definitions)
VALUES (
  ${resultsObject.id},
  ${modDef.id},
  ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null}
)
`;
    }
    for (const metric of modDef.metrics) {
      const validatedMetric = metricStrict.parse(metric);
      await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  results_object_id, ai_description, viz_presets, hide, important_notes
)
VALUES (
  ${validatedMetric.id},
  ${modDef.id},
  ${validatedMetric.label},
  ${validatedMetric.variantLabel},
  ${validatedMetric.valueFunc},
  ${validatedMetric.formatAs},
  ${JSON.stringify(validatedMetric.valueProps)},
  ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
  ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
  ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
  ${validatedMetric.resultsObjectId},
  ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
  ${JSON.stringify(validatedMetric.vizPresets)},
  ${validatedMetric.hide},
  ${validatedMetric.importantNotes}
)
`;
    }
  });
}

//////////////////////////////////////////////////////////////////////////////
//  __    __            __                        __                __  __  //
// /  |  /  |          /  |                      /  |              /  |/  | //
// $$ |  $$ | _______  $$/  _______    _______  _$$ |_     ______  $$ |$$ | //
// $$ |  $$ |/       \ /  |/       \  /       |/ $$   |   /      \ $$ |$$ | //
// $$ |  $$ |$$$$$$$  |$$ |$$$$$$$  |/$$$$$$$/ $$$$$$/    $$$$$$  |$$ |$$ | //
// $$ |  $$ |$$ |  $$ |$$ |$$ |  $$ |$$      \   $$ | __  /    $$ |$$ |$$ | //
// $$ \__$$ |$$ |  $$ |$$ |$$ |  $$ | $$$$$$  |  $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$    $$/ $$ |  $$ |$$ |$$ |  $$ |/     $$/   $$  $$/ $$    $$ |$$ |$$ | //
//  $$$$$$/  $$/   $$/ $$/ $$/   $$/ $$$$$$$/     $$$$/   $$$$$$$/ $$/ $$/  //
//                                                                          //
//////////////////////////////////////////////////////////////////////////////

export async function uninstallModule(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseNoData> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
SELECT * FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (!rawModule) {
      return { success: true };
    }
    const moduleDefinition = parseInstalledModuleDefinition(
      rawModule.module_definition,
    );
    await projectDb.begin(async (sql: Sql) => {
      await sql`DELETE FROM modules WHERE id = ${moduleId}`;
      for (const resultsObject of moduleDefinition.resultsObjects) {
        const roTableName = getResultsObjectTableName(resultsObject.id);
        await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
      }
      await purgeOrphanedPresentationObjects(sql);
    });
    return { success: true };
  });
}
