import { z } from "zod";
import { Sql } from "postgres";
import {
  // _ADMIN_SERVER_HOST,
  _INSTANCE_LANGUAGE,
} from "../../exposed_env_vars.ts";
import {
  APIResponseNoData,
  APIResponseWithData,
  InstalledModuleSummary,
  InstalledModuleWithConfigSelections,
  InstalledModuleWithResultsValues,
  ModuleDefinitionDetail,
  parseInstalledModuleDefinition,
  getDisaggregationLabel,
  getStartingModuleConfigSelections,
  getMergedModuleConfigSelections,
  getValidatedModuleId,
  parseJsonOrThrow,
  throwIfErrWithData,
  vizPresetInstalled,
  moduleDefinitionInstalledSchema,
  metricStrict,
  presentationObjectConfigSchema,
  type DirtyOrRunStatus,
  type Metric,
  type MetricStatus,
  type MetricWithStatus,
  type ModuleConfigSelections,
  type ModuleDetailForRunningScript,
  type ModuleId,
  type ResultsValue,
} from "lib";
import { getModuleDefinitionDetail, fetchModuleFiles, hasComputeAffectingChanges } from "../../module_loader/mod.ts";
import {
  detectHasAnyRows,
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBMetric, DBModule } from "./_project_database_types.ts";
import { getAdminAreaLabelsConfig, getFacilityColumnsConfig } from "../instance/config.ts";
import { enrichMetric } from "./metric_enricher.ts";

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
INSERT INTO results_objects (id, module_id, description, column_definitions)
VALUES (
  ${resultsObject.id},
  ${modDef.data.id},
  ${resultsObject.description},
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
    });
    return { success: true };
  });
}

//////////////////////////////////////////////////////////////////
//  __    __                  __              __                //
// /  |  /  |                /  |            /  |               //
// $$ |  $$ |  ______    ____$$ |  ______   _$$ |_     ______   //
// $$ |  $$ | /      \  /    $$ | /      \ / $$   |   /      \  //
// $$ |  $$ |/$$$$$$  |/$$$$$$$ | $$$$$$  |$$$$$$/   /$$$$$$  | //
// $$ |  $$ |$$ |  $$ |$$ |  $$ | /    $$ |  $$ | __ $$    $$ | //
// $$ \__$$ |$$ |__$$ |$$ \__$$ |/$$$$$$$ |  $$ |/  |$$$$$$$$/  //
// $$    $$/ $$    $$/ $$    $$ |$$    $$ |  $$  $$/ $$       | //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$$/  //
//           $$ |                                               //
//           $$ |                                               //
//           $$/                                                //
//                                                              //
//////////////////////////////////////////////////////////////////

export async function updateModuleDefinition(
  projectDb: Sql,
  moduleDefinitionId: ModuleId,
  reinstall: boolean,
  rerun: boolean,
  preserveSettings: boolean,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    presObjIdsWithNewLastUpdateds: string[];
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
        SELECT * FROM modules WHERE id = ${moduleDefinitionId}
      `
    ).at(0);

    if (!rawModule) {
      throw new Error("Module not found");
    }

    const lastUpdated = new Date().toISOString();

    // If neither reinstall nor rerun requested, nothing to do
    if (!reinstall && !rerun) {
      return {
        success: true,
        data: { lastUpdated, presObjIdsWithNewLastUpdateds: [] },
      };
    }

    // If only rerun (no reinstall), nothing to do in DB — route handler calls setModuleDirty()
    if (!reinstall && rerun) {
      return {
        success: true,
        data: { lastUpdated, presObjIdsWithNewLastUpdateds: [] },
      };
    }

    // From here: reinstall is true (rerun may or may not be true)

    const modDef = await getModuleDefinitionDetail(
      moduleDefinitionId,
      _INSTANCE_LANGUAGE,
    );
    throwIfErrWithData(modDef);

    const gitRef = modDef.data.gitRef;

    // Compute new config selections
    const oldConfigSelections = parseModuleConfigSelections(
      rawModule.config_selections,
    );
    const newConfigSelections = preserveSettings
      ? getMergedModuleConfigSelections(
          oldConfigSelections,
          modDef.data.configRequirements,
        )
      : getStartingModuleConfigSelections(modDef.data.configRequirements);

    const configSelectionsChanged =
      JSON.stringify(newConfigSelections.parameterSelections) !==
      JSON.stringify(oldConfigSelections.parameterSelections);

    // Detect compute-affecting changes (script, configRequirements, resultsObjects)
    const storedDef = parseInstalledModuleDefinition(rawModule.module_definition);

    const computeAffectingChanged = hasComputeAffectingChanges(
      modDef.data.script,
      modDef.data.configRequirements,
      modDef.data.resultsObjects,
      storedDef,
    );

    const metricIds = modDef.data.metrics.map((m) => m.id);
    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    if (rerun) {
      // REINSTALL + RERUN: Full reinstall, drop tables, set dirty='ready'
      // (route handler calls setModuleDirty() to queue)

      await projectDb.begin(async (sql: Sql) => {
        // Delete module (cascades to metrics, results_objects metadata)
        await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;

        // Insert fresh module with dirty='ready'
        await sql`
          INSERT INTO modules
            (id, module_definition, config_selections, dirty,
             compute_def_updated_at, compute_def_git_ref,
             presentation_def_updated_at, presentation_def_git_ref,
             config_updated_at, last_run_at, last_run_git_ref)
          VALUES (
            ${modDef.data.id},
            ${prepareModuleDefinitionForStorage(modDef.data)},
            ${JSON.stringify(newConfigSelections)},
            'ready',
            ${computeAffectingChanged ? lastUpdated : rawModule.compute_def_updated_at},
            ${computeAffectingChanged ? (gitRef ?? null) : rawModule.compute_def_git_ref},
            ${lastUpdated},
            ${gitRef ?? null},
            ${lastUpdated},
            ${rawModule.last_run_at},
            ${rawModule.last_run_git_ref}
          )`;

        // Drop and recreate results object tables
        for (const resultsObject of modDef.data.resultsObjects) {
          const roTableName = getResultsObjectTableName(resultsObject.id);
          await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
          await sql`
            INSERT INTO results_objects (id, module_id, description, column_definitions)
            VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
              ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
        }

        // Insert metrics
        for (const metric of modDef.data.metrics) {
          const validatedMetric = metricStrict.parse(metric);
          await sql`
            INSERT INTO metrics (
              id, module_id, label, variant_label, value_func, format_as, value_props,
              required_disaggregation_options, value_label_replacements, post_aggregation_expression,
              results_object_id, ai_description, viz_presets, hide, important_notes
            ) VALUES (
              ${validatedMetric.id}, ${modDef.data.id}, ${validatedMetric.label}, ${validatedMetric.variantLabel},
              ${validatedMetric.valueFunc}, ${validatedMetric.formatAs}, ${JSON.stringify(validatedMetric.valueProps)},
              ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
              ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
              ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
              ${validatedMetric.resultsObjectId}, ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
              ${JSON.stringify(validatedMetric.vizPresets)},
              ${validatedMetric.hide}, ${validatedMetric.importantNotes})`;
        }

        // Recreate default presentation objects
        if (metricIds.length > 0) {
          await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
        }
        for (const po of defaultPresentationObjects) {
          const validatedConfig = presentationObjectConfigSchema.parse(
            po.config,
          );
          await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
          await sql`
            INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
            VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(validatedConfig)}, ${lastUpdated}, ${po.sortOrder})`;
        }
      });
    } else {
      // REINSTALL ONLY (no rerun): Update in place, preserve data tables, preserve dirty state

      await projectDb.begin(async (sql: Sql) => {
        // Update module row (keep dirty state as-is)
        await sql`
          UPDATE modules
          SET
            module_definition = ${prepareModuleDefinitionForStorage(modDef.data)},
            config_selections = ${JSON.stringify(newConfigSelections)},
            compute_def_updated_at = ${computeAffectingChanged ? lastUpdated : rawModule.compute_def_updated_at},
            compute_def_git_ref = ${computeAffectingChanged ? (gitRef ?? null) : rawModule.compute_def_git_ref},
            presentation_def_updated_at = ${lastUpdated},
            presentation_def_git_ref = ${gitRef ?? rawModule.presentation_def_git_ref},
            config_updated_at = ${configSelectionsChanged ? lastUpdated : rawModule.config_updated_at}
          WHERE id = ${moduleDefinitionId}
        `;

        // Delete and recreate metadata rows (NOT data tables)
        await sql`DELETE FROM results_objects WHERE module_id = ${modDef.data.id}`;
        await sql`DELETE FROM metrics WHERE module_id = ${modDef.data.id}`;

        for (const resultsObject of modDef.data.resultsObjects) {
          await sql`
            INSERT INTO results_objects (id, module_id, description, column_definitions)
            VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
              ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
        }

        for (const metric of modDef.data.metrics) {
          const validatedMetric = metricStrict.parse(metric);
          await sql`
            INSERT INTO metrics (
              id, module_id, label, variant_label, value_func, format_as, value_props,
              required_disaggregation_options, value_label_replacements, post_aggregation_expression,
              results_object_id, ai_description, viz_presets, hide, important_notes
            ) VALUES (
              ${validatedMetric.id}, ${modDef.data.id}, ${validatedMetric.label}, ${validatedMetric.variantLabel},
              ${validatedMetric.valueFunc}, ${validatedMetric.formatAs}, ${JSON.stringify(validatedMetric.valueProps)},
              ${JSON.stringify(validatedMetric.requiredDisaggregationOptions)},
              ${validatedMetric.valueLabelReplacements ? JSON.stringify(validatedMetric.valueLabelReplacements) : null},
              ${validatedMetric.postAggregationExpression ? JSON.stringify(validatedMetric.postAggregationExpression) : null},
              ${validatedMetric.resultsObjectId}, ${validatedMetric.aiDescription ? JSON.stringify(validatedMetric.aiDescription) : null},
              ${JSON.stringify(validatedMetric.vizPresets)},
              ${validatedMetric.hide}, ${validatedMetric.importantNotes})`;
        }

        // Recreate default presentation objects
        if (metricIds.length > 0) {
          await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
        }
        for (const po of defaultPresentationObjects) {
          const validatedConfig = presentationObjectConfigSchema.parse(
            po.config,
          );
          await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
          await sql`
            INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
            VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(validatedConfig)}, ${lastUpdated}, ${po.sortOrder})`;
        }
      });
    }

    // Update presentation_objects timestamps and get IDs for SSE
    let presObjIdsWithNewLastUpdateds: string[] = [];
    if (metricIds.length > 0) {
      await projectDb`UPDATE presentation_objects SET last_updated = ${lastUpdated} WHERE metric_id = ANY(${metricIds})`;
      const allPresObjs = await projectDb<{ id: string }[]>`SELECT id FROM presentation_objects WHERE metric_id = ANY(${metricIds})`;
      presObjIdsWithNewLastUpdateds = allPresObjs.map((po) => po.id);
    }

    return {
      success: true,
      data: { lastUpdated, presObjIdsWithNewLastUpdateds },
    };
  });
}

////////////////////////////////////////////////////////////
//   ______               __                      __  __  //
//  /      \             /  |                    /  |/  | //
// /$$$$$$  |  ______   _$$ |_           ______  $$ |$$ | //
// $$ | _$$/  /      \ / $$   |         /      \ $$ |$$ | //
// $$ |/    |/$$$$$$  |$$$$$$/          $$$$$$  |$$ |$$ | //
// $$ |$$$$ |$$    $$ |  $$ | __        /    $$ |$$ |$$ | //
// $$ \__$$ |$$$$$$$$/   $$ |/  |      /$$$$$$$ |$$ |$$ | //
// $$    $$/ $$       |  $$  $$/       $$    $$ |$$ |$$ | //
//  $$$$$$/   $$$$$$$/    $$$$/         $$$$$$$/ $$/ $$/  //
//                                                        //
////////////////////////////////////////////////////////////

export async function getAllModulesForProject(
  projectDb: Sql,
): Promise<APIResponseWithData<InstalledModuleSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModules = await projectDb<DBModule[]>`SELECT * FROM modules`;

    // Get results object IDs per module from results_objects table
    const resultsObjectRows = await projectDb<
      { module_id: string; id: string }[]
    >`
      SELECT module_id, id FROM results_objects ORDER BY module_id, id
    `;
    const resultsObjectIdsByModule = new Map<string, string[]>();
    for (const row of resultsObjectRows) {
      const existing = resultsObjectIdsByModule.get(row.module_id) ?? [];
      existing.push(row.id);
      resultsObjectIdsByModule.set(row.module_id, existing);
    }

    const modules = rawModules.map<InstalledModuleSummary>((rawModule) => {
      const moduleDefinition = parseInstalledModuleDefinition(
        rawModule.module_definition,
      );

      return {
        id: getValidatedModuleId(rawModule.id),
        label: moduleDefinition.label,
        dirty: rawModule.dirty as DirtyOrRunStatus,
        hasParameters: (moduleDefinition.configRequirements?.parameters?.length ?? 0) > 0,
        computeDefUpdatedAt: rawModule.compute_def_updated_at ?? undefined,
        computeDefGitRef: rawModule.compute_def_git_ref ?? undefined,
        presentationDefUpdatedAt: rawModule.presentation_def_updated_at ?? undefined,
        presentationDefGitRef: rawModule.presentation_def_git_ref ?? undefined,
        configUpdatedAt: rawModule.config_updated_at ?? undefined,
        lastRunAt: rawModule.last_run_at,
        lastRunGitRef: rawModule.last_run_git_ref ?? undefined,
        moduleDefinitionResultsObjectIds:
          resultsObjectIdsByModule.get(rawModule.id) ?? [],
      };
    });
    return { success: true, data: modules };
  });
}

//////////////////////////////////////////////////////////////////////////////////////////
//   ______               __                      __                      __            //
//  /      \             /  |                    /  |                    /  |           //
// /$$$$$$  |  ______   _$$ |_           _______ $$/  _______    ______  $$ |  ______   //
// $$ | _$$/  /      \ / $$   |         /       |/  |/       \  /      \ $$ | /      \  //
// $$ |/    |/$$$$$$  |$$$$$$/         /$$$$$$$/ $$ |$$$$$$$  |/$$$$$$  |$$ |/$$$$$$  | //
// $$ |$$$$ |$$    $$ |  $$ | __       $$      \ $$ |$$ |  $$ |$$ |  $$ |$$ |$$    $$ | //
// $$ \__$$ |$$$$$$$$/   $$ |/  |       $$$$$$  |$$ |$$ |  $$ |$$ \__$$ |$$ |$$$$$$$$/  //
// $$    $$/ $$       |  $$  $$/       /     $$/ $$ |$$ |  $$ |$$    $$ |$$ |$$       | //
//  $$$$$$/   $$$$$$$/    $$$$/        $$$$$$$/  $$/ $$/   $$/  $$$$$$$ |$$/  $$$$$$$/  //
//                                                             /  \__$$ |               //
//                                                             $$    $$/                //
//                                                              $$$$$$/                 //
//                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////

export async function getModuleDetail(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseWithData<ModuleDetailForRunningScript>> {
  return await tryCatchDatabaseAsync(async () => {
    // //////////////////////////
    // //////////////////////////
    // // This should be allowed to fail. Need to keep the main app working, even if the central server is down.
    // let lastUpdated: string | undefined = undefined;
    // try {
    //   const resLastUpdated = await fetch(
    //     `${_ADMIN_SERVER_HOST}/module_definition_last_updated/${moduleId}`
    //   );
    //   const jsonLastUpdated: APIResponseWithData<string> =
    //     await resLastUpdated.json();
    //   if (jsonLastUpdated.success) {
    //     lastUpdated = jsonLastUpdated.data;
    //   }
    // } catch {
    //   //
    // }
    // //////////////////////////
    // //////////////////////////

    const rawModule = (
      await projectDb<DBModule[]>`
SELECT * FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (rawModule === undefined) {
      throw new Error("No module with this definition id");
    }
    const moduleDefinition = parseInstalledModuleDefinition(
      rawModule.module_definition,
    );
    const module: ModuleDetailForRunningScript = {
      id: getValidatedModuleId(rawModule.id),
      moduleDefinition,
      configSelections: parseModuleConfigSelections(rawModule.config_selections),
    };
    return { success: true, data: module };
  });
}

// export async function getModuleParameters(
//   projectDb: Sql,
//   moduleId: string
// ): Promise<APIResponseWithData<ModuleParameter[]>> {
//   return await tryCatchDatabaseAsync(async () => {
//     const rawModule = (
//       await projectDb<{ module_definition: string }[]>`
// SELECT module_definition FROM modules WHERE id = ${moduleId}
// `
//     ).at(0);
//     if (rawModule === undefined) {
//       throw new Error("No module with this definition id");
//     }
//     const moduleDefinition: ModuleDefinition = parseJsonOrThrow(
//       rawModule.module_definition
//     );
//     return { success: true, data: moduleDefinition.parameters };
//   });
// }

export async function getModuleLastRun(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<{ last_run_at: string }[]>`
SELECT last_run_at FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (rawModule === undefined) {
      throw new Error("No module with this definition id");
    }
    return { success: true, data: rawModule.last_run_at };
  });
}

export async function getMetricsForModule(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseWithData<Metric[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawMetrics = await projectDb<DBMetric[]>`
      SELECT * FROM metrics WHERE module_id = ${moduleId}
    `;
    return {
      success: true,
      data: rawMetrics.map(
        (m): Metric => ({
          id: m.id,
          label: m.label,
          variantLabel: m.variant_label,
          valueFunc: m.value_func as Metric["valueFunc"],
          formatAs: m.format_as as Metric["formatAs"],
          valueProps: JSON.parse(m.value_props),
          requiredDisaggregationOptions: JSON.parse(
            m.required_disaggregation_options,
          ),
          valueLabelReplacements: m.value_label_replacements
            ? JSON.parse(m.value_label_replacements)
            : null,
          postAggregationExpression: m.post_aggregation_expression
            ? JSON.parse(m.post_aggregation_expression)
            : null,
          resultsObjectId: m.results_object_id,
          aiDescription: m.ai_description ? JSON.parse(m.ai_description) : null,
          vizPresets: m.viz_presets ? JSON.parse(m.viz_presets) : [],
          hide: m.hide,
          importantNotes: m.important_notes,
        }),
      ),
    };
  });
}

export async function getMetricsListForAI(
  mainDb: Sql,
  projectDb: Sql,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    const adminAreaLabelsResult = await getAdminAreaLabelsConfig(mainDb);
    const adminAreaLabels = adminAreaLabelsResult.success
      ? adminAreaLabelsResult.data
      : undefined;

    const rawModules = await projectDb<DBModule[]>`
      SELECT * FROM modules ORDER BY id
    `;

    const rawMetrics = await projectDb<DBMetric[]>`
      SELECT * FROM metrics
    `;

    const metricsByModule = new Map<string, DBMetric[]>();
    for (const metric of rawMetrics) {
      const existing = metricsByModule.get(metric.module_id) ?? [];
      existing.push(metric);
      metricsByModule.set(metric.module_id, existing);
    }

    const lines: string[] = [
      "AVAILABLE METRICS",
      "=".repeat(80),
      "",
      "Each metric can be queried using get_metric_data with metricId.",
      "Required disaggregations are automatically included. Optional ones can be added for more detail.",
      "",
      "PERIOD OPTIONS (for disaggregation and filtering):",
      "  - period_id (YYYYMM): By specific month. Examples: 202301 (Jan 2023), 202412 (Dec 2024)",
      "  - quarter_id (YYYYQQ): By specific quarter. Examples: 202301 (Q1 2023), 202404 (Q4 2024)",
      "  - year (YYYY): By year. Examples: 2023, 2024",
      "  - month (1-12): By month-of-year for seasonal patterns. Examples: 1 (all Januaries), 12 (all Decembers)",
      "",
    ];

    for (const rawModule of rawModules) {
      const moduleDefinition = parseInstalledModuleDefinition(
        rawModule.module_definition,
      );
      const moduleMetrics = metricsByModule.get(rawModule.id) ?? [];

      lines.push(`MODULE: ${moduleDefinition.label} (${rawModule.id})`);
      lines.push("-".repeat(60));

      if (moduleMetrics.length === 0) {
        lines.push("  No metrics available");
        lines.push("");
        continue;
      }

      // Enrich all metrics first
      const enrichedMetrics: ResultsValue[] = [];
      for (const dbMetric of moduleMetrics) {
        const metric = await enrichMetric(dbMetric, projectDb, facilityConfig);
        enrichedMetrics.push(metric);
      }

      // Group by label
      const metricGroups = new Map<string, ResultsValue[]>();
      for (const metric of enrichedMetrics) {
        const existing = metricGroups.get(metric.label) ?? [];
        existing.push(metric);
        metricGroups.set(metric.label, existing);
      }

      for (const [label, variants] of metricGroups) {
        const firstVariant = variants[0];

        if (variants.length === 1 && !firstVariant.variantLabel) {
          // Single metric without variants - use old format
          lines.push(`  METRIC: ${label}`);
          lines.push(`    ID: ${firstVariant.id}`);
          lines.push(`    Format: ${firstVariant.formatAs}`);

          if (firstVariant.valueProps.length > 0) {
            lines.push(`    Value properties:`);
            for (const prop of firstVariant.valueProps) {
              const propLabel =
                firstVariant.valueLabelReplacements?.[prop] || prop;
              lines.push(`      - ${prop}: ${propLabel}`);
            }
          }

          if (firstVariant.aiDescription?.summary) {
            lines.push(
              `    Summary: ${getAIStr(firstVariant.aiDescription.summary)}`,
            );
          }
          if (firstVariant.aiDescription?.methodology) {
            lines.push(
              `    Methodology: ${getAIStr(firstVariant.aiDescription.methodology)}`,
            );
          }
          if (firstVariant.aiDescription?.interpretation) {
            lines.push(
              `    Interpretation: ${getAIStr(firstVariant.aiDescription.interpretation)}`,
            );
          }
          if (firstVariant.aiDescription?.typicalRange) {
            lines.push(
              `    Typical range: ${getAIStr(firstVariant.aiDescription.typicalRange)}`,
            );
          }
          if (firstVariant.aiDescription?.caveats) {
            lines.push(
              `    Caveats: ${getAIStr(firstVariant.aiDescription.caveats)}`,
            );
          }
          if (firstVariant.aiDescription?.disaggregationGuidance) {
            lines.push(
              `    Disaggregation guidance: ${getAIStr(firstVariant.aiDescription.disaggregationGuidance)}`,
            );
          }

          const required = firstVariant.disaggregationOptions.filter(
            (opt) => opt.isRequired,
          );
          const optional = firstVariant.disaggregationOptions.filter(
            (opt) => !opt.isRequired,
          );

          if (required.length > 0) {
            lines.push(
              `    Automatically disaggregated by: ${required.map((opt) => opt.value).join(", ")}`,
            );
          }

          if (optional.length > 0) {
            lines.push(`    Optional additional disaggregations:`);
            for (const opt of optional) {
              lines.push(
                `      - ${opt.value} (${
                  getDisaggregationLabel(opt.value, {
                    adminAreaLabels,
                    facilityColumns: facilityConfig,
                  }).en
                })`,
              );
            }
          }

          lines.push(
            `    Period options: ${firstVariant.mostGranularTimePeriodColumnInResultsFile ?? "none"}`,
          );
          lines.push("");
        } else {
          // Multiple variants or has variantLabel - use grouped format
          lines.push(`  METRIC: ${label}`);
          lines.push(`    Format: ${firstVariant.formatAs}`);

          if (firstVariant.valueProps.length > 0) {
            lines.push(`    Value properties:`);
            for (const prop of firstVariant.valueProps) {
              const propLabel =
                firstVariant.valueLabelReplacements?.[prop] || prop;
              lines.push(`      - ${prop}: ${propLabel}`);
            }
          }

          if (firstVariant.aiDescription?.summary) {
            lines.push(
              `    Summary: ${getAIStr(firstVariant.aiDescription.summary)}`,
            );
          }
          if (firstVariant.aiDescription?.methodology) {
            lines.push(
              `    Methodology: ${getAIStr(firstVariant.aiDescription.methodology)}`,
            );
          }
          if (firstVariant.aiDescription?.interpretation) {
            lines.push(
              `    Interpretation: ${getAIStr(firstVariant.aiDescription.interpretation)}`,
            );
          }
          if (firstVariant.aiDescription?.typicalRange) {
            lines.push(
              `    Typical range: ${getAIStr(firstVariant.aiDescription.typicalRange)}`,
            );
          }
          if (firstVariant.aiDescription?.caveats) {
            lines.push(
              `    Caveats: ${getAIStr(firstVariant.aiDescription.caveats)}`,
            );
          }
          if (firstVariant.aiDescription?.disaggregationGuidance) {
            lines.push(
              `    Disaggregation guidance: ${getAIStr(firstVariant.aiDescription.disaggregationGuidance)}`,
            );
          }

          lines.push(
            `    Period options: ${firstVariant.mostGranularTimePeriodColumnInResultsFile ?? "none"}`,
          );
          lines.push("");
          lines.push(`    Available at:`);

          for (const variant of variants) {
            const variantName = variant.variantLabel || "Default";
            lines.push(`      - ${variantName} (ID: ${variant.id})`);

            const required = variant.disaggregationOptions.filter(
              (opt) => opt.isRequired,
            );
            const optional = variant.disaggregationOptions.filter(
              (opt) => !opt.isRequired,
            );

            if (required.length > 0) {
              lines.push(
                `        Automatically disaggregated by: ${required.map((opt) => opt.value).join(", ")}`,
              );
            }

            if (optional.length > 0) {
              lines.push(
                `        Optional: ${optional.map((opt) => opt.value).join(", ")}`,
              );
            }

            lines.push("");
          }
        }
      }
      lines.push("");
    }

    return { success: true, data: lines.join("\n") };
  });
}

function getAIStr(val: string | { en: string; fr?: string }): string {
  if (typeof val === "string") return val;
  return val.en;
}

export async function getAllMetrics(
  mainDb: Sql,
  projectDb: Sql,
): Promise<APIResponseWithData<ResultsValue[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    const rawMetrics = await projectDb<DBMetric[]>`
      SELECT * FROM metrics ORDER BY label
    `;

    const metrics: ResultsValue[] = [];
    for (const dbMetric of rawMetrics) {
      const enrichedMetric = await enrichMetric(dbMetric, projectDb, facilityConfig);
      metrics.push(enrichedMetric);
    }

    return { success: true, data: metrics };
  });
}

export async function getMetricsWithStatus(
  mainDb: Sql,
  projectDb: Sql,
): Promise<APIResponseWithData<MetricWithStatus[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    // Get all modules with their dirty states
    const rawModules = await projectDb<{ id: string; dirty: string }[]>`
      SELECT id, dirty FROM modules
    `;
    const moduleDirtyMap = new Map<string, DirtyOrRunStatus>();
    for (const mod of rawModules) {
      moduleDirtyMap.set(mod.id, mod.dirty as DirtyOrRunStatus);
    }

    // Get all metrics from the database
    const rawMetrics = await projectDb<DBMetric[]>`
      SELECT * FROM metrics ORDER BY label
    `;

    const metrics: MetricWithStatus[] = [];
    for (const dbMetric of rawMetrics) {
      if (dbMetric.hide) continue;

      const enrichedMetric = await enrichMetric(dbMetric, projectDb, facilityConfig);

      const moduleId = dbMetric.module_id as ModuleId;
      const moduleDirty = moduleDirtyMap.get(dbMetric.module_id);

      // Determine status
      let status: MetricStatus;
      if (!moduleDirty) {
        // Module not installed (shouldn't happen if metric exists, but handle it)
        status = "module_not_installed";
      } else if (moduleDirty === "error") {
        status = "error";
      } else if (moduleDirty === "queued" || moduleDirty === "running") {
        status = "results_not_ready";
      } else {
        // Module is "ready" - but check if results object table has data
        const tableName = getResultsObjectTableName(dbMetric.results_object_id);
        const hasData = await detectHasAnyRows(projectDb, tableName);
        status = hasData ? "ready" : "results_not_ready";
      }

      metrics.push({
        ...enrichedMetric,
        status,
        moduleId,
        vizPresets: dbMetric.viz_presets
          ? z.array(vizPresetInstalled).parse(JSON.parse(dbMetric.viz_presets))
          : undefined,
      });
    }

    return { success: true, data: metrics };
  });
}

export async function getModulesListForAI(
  projectDb: Sql,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModules = await projectDb<DBModule[]>`
      SELECT * FROM modules ORDER BY id
    `;

    // Get metric counts per module
    const metricCounts = await projectDb<
      { module_id: string; count: string }[]
    >`
      SELECT module_id, COUNT(*) as count FROM metrics GROUP BY module_id
    `;
    const metricCountMap = new Map(
      metricCounts.map((m) => [m.module_id, parseInt(m.count)]),
    );

    const lines = ["AVAILABLE MODULES", "=".repeat(80), ""];

    for (const rawModule of rawModules) {
      const moduleDefinition = parseInstalledModuleDefinition(
        rawModule.module_definition,
      );

      lines.push(`ID: ${rawModule.id}`);
      lines.push(`Name: ${moduleDefinition.label}`);
      lines.push(`Has Parameters: ${moduleDefinition.configRequirements.parameters.length > 0}`);
      lines.push(`Presentation Def Updated: ${rawModule.presentation_def_updated_at}`);
      lines.push(`Last Run: ${rawModule.last_run_at}`);
      lines.push(
        `Status: ${rawModule.dirty === "true" ? "Needs update" : "Up to date"}`,
      );

      const metricCount = metricCountMap.get(rawModule.id) ?? 0;
      lines.push(`Metrics: ${metricCount}`);

      lines.push("-".repeat(80));
      lines.push("");
    }

    return { success: true, data: lines.join("\n") };
  });
}

export async function getModuleWithConfigSelections(
  projectDb: Sql,
  moduleId: string,
): Promise<APIResponseWithData<InstalledModuleWithConfigSelections>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
SELECT * FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (rawModule === undefined) {
      throw new Error("No module with this id");
    }

    const moduleDefinition = parseInstalledModuleDefinition(
      rawModule.module_definition,
    );
    const configSelections = parseModuleConfigSelections(
      rawModule.config_selections,
    );

    const module: InstalledModuleWithConfigSelections = {
      id: getValidatedModuleId(rawModule.id),
      label: moduleDefinition.label,
      configSelections,
    };

    return { success: true, data: module };
  });
}

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  __    __                  __              __                                                    __            __                                                                                __      __                      //
// /  |  /  |                /  |            /  |                                                  /  |          /  |                                                                              /  |    /  |                     //
// $$ |  $$ |  ______    ____$$ |  ______   _$$ |_     ______         _____  ____    ______    ____$$ | __    __ $$ |  ______          ______    ______    ______    ______    ______    ______   _$$ |_   $$/   ______    _______  //
// $$ |  $$ | /      \  /    $$ | /      \ / $$   |   /      \       /     \/    \  /      \  /    $$ |/  |  /  |$$ | /      \        /      \  /      \  /      \  /      \  /      \  /      \ / $$   |  /  | /      \  /       | //
// $$ |  $$ |/$$$$$$  |/$$$$$$$ | $$$$$$  |$$$$$$/   /$$$$$$  |      $$$$$$ $$$$  |/$$$$$$  |/$$$$$$$ |$$ |  $$ |$$ |/$$$$$$  |      /$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$/   $$ |/$$$$$$  |/$$$$$$$/  //
// $$ |  $$ |$$ |  $$ |$$ |  $$ | /    $$ |  $$ | __ $$    $$ |      $$ | $$ | $$ |$$ |  $$ |$$ |  $$ |$$ |  $$ |$$ |$$    $$ |      $$ |  $$ |$$ |  $$/ $$ |  $$ |$$ |  $$ |$$    $$ |$$ |  $$/   $$ | __ $$ |$$    $$ |$$      \  //
// $$ \__$$ |$$ |__$$ |$$ \__$$ |/$$$$$$$ |  $$ |/  |$$$$$$$$/       $$ | $$ | $$ |$$ \__$$ |$$ \__$$ |$$ \__$$ |$$ |$$$$$$$$/       $$ |__$$ |$$ |      $$ \__$$ |$$ |__$$ |$$$$$$$$/ $$ |        $$ |/  |$$ |$$$$$$$$/  $$$$$$  | //
// $$    $$/ $$    $$/ $$    $$ |$$    $$ |  $$  $$/ $$       |      $$ | $$ | $$ |$$    $$/ $$    $$ |$$    $$/ $$ |$$       |      $$    $$/ $$ |      $$    $$/ $$    $$/ $$       |$$ |        $$  $$/ $$ |$$       |/     $$/  //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$$/       $$/  $$/  $$/  $$$$$$/   $$$$$$$/  $$$$$$/  $$/  $$$$$$$/       $$$$$$$/  $$/        $$$$$$/  $$$$$$$/   $$$$$$$/ $$/          $$$$/  $$/  $$$$$$$/ $$$$$$$/   //
//           $$ |                                                                                                                    $$ |                          $$ |                                                             //
//           $$ |                                                                                                                    $$ |                          $$ |                                                             //
//           $$/                                                                                                                     $$/                           $$/                                                              //
//                                                                                                                                                                                                                                  //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function updateModuleParameters(
  projectDb: Sql,
  moduleId: string,
  newParams: Record<string, string>,
): Promise<APIResponseWithData<{ lastUpdated: string }>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModule = (
      await projectDb<DBModule[]>`
SELECT * FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (rawModule === undefined) {
      throw new Error("No module with this definition id");
    }
    const lastUpdated = new Date().toISOString();
    const currentConfigSelections = parseModuleConfigSelections(
      rawModule.config_selections,
    );

    const updatedConfigSelections: ModuleConfigSelections = {
      ...currentConfigSelections,
      parameterSelections: {
        ...currentConfigSelections.parameterSelections,
        ...newParams,
      },
    };

    await projectDb`
UPDATE modules
SET
  config_selections = ${JSON.stringify(updatedConfigSelections)},
  config_updated_at = ${lastUpdated}
WHERE id = ${moduleId}
`;
    return { success: true, data: { lastUpdated } };
  });
}
