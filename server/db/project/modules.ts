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
  ModuleDefinition,
  getStartingModuleConfigSelections,
  getMergedModuleConfigSelections,
  getValidatedModuleId,
  parseJsonOrThrow,
  throwIfErrWithData,
  type DirtyOrRunStatus,
  type MetricStatus,
  type MetricWithStatus,
  type ModuleConfigSelections,
  type ModuleDetailForRunningScript,
  type ModuleId,
  type ResultsValue,
} from "lib";
import { getModuleDefinitionDetail, fetchModuleFiles } from "../../module_loader/mod.ts";
import {
  detectHasAnyRows,
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBMetric, DBModule } from "./_project_database_types.ts";
import { getFacilityColumnsConfig } from "../instance/config.ts";
import { enrichMetric } from "./metric_enricher.ts";

export function parseModuleConfigSelections(json: string): ModuleConfigSelections {
  const raw = parseJsonOrThrow<Record<string, unknown>>(json);
  return {
    parameterDefinitions: (raw.parameterDefinitions ?? []) as ModuleConfigSelections["parameterDefinitions"],
    parameterSelections: (raw.parameterSelections ?? {}) as ModuleConfigSelections["parameterSelections"],
  };
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

      // Insert module
      await sql`
INSERT INTO modules
  (id, module_definition, config_selections, dirty, installed_at, script_updated_at, definition_updated_at, config_updated_at, last_run_at, installed_git_ref)
VALUES
  (
    ${modDef.data.id},
    ${JSON.stringify(modDef.data)},
    ${JSON.stringify(startingConfigSelections)},
    'queued',
    ${lastUpdated},
    ${lastUpdated},
    ${lastUpdated},
    ${lastUpdated},
    ${lastUpdated},
    ${gitRef ?? null}
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

      // Insert metrics
      for (const metric of modDef.data.metrics) {
        await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props, period_options,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  results_object_id, ai_description, viz_presets, hide, important_notes
)
VALUES (
  ${metric.id},
  ${modDef.data.id},
  ${metric.label},
  ${metric.variantLabel ?? null},
  ${metric.valueFunc},
  ${metric.formatAs},
  ${JSON.stringify(metric.valueProps)},
  ${JSON.stringify(metric.periodOptions ?? [])},
  ${JSON.stringify(metric.requiredDisaggregationOptions)},
  ${metric.valueLabelReplacements ? JSON.stringify(metric.valueLabelReplacements) : null},
  ${metric.postAggregationExpression ? JSON.stringify(metric.postAggregationExpression) : null},
  ${metric.resultsObjectId},
  ${metric.aiDescription ? JSON.stringify(metric.aiDescription) : null},
  ${metric.vizPresets ? JSON.stringify(metric.vizPresets) : null},
  ${metric.hide ?? false},
  ${metric.importantNotes ?? null}
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

      // Insert default presentation objects
      for (const presObjectDef of defaultPresentationObjects) {
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
    ${JSON.stringify(presObjectDef.config)},
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
    const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
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
  preserveSettings: boolean,
): Promise<
  APIResponseWithData<{
    lastUpdated: string;
    presObjIdsWithNewLastUpdateds: string[];
    computeChange: boolean;
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

    const modDef = await getModuleDefinitionDetail(
      moduleDefinitionId,
      _INSTANCE_LANGUAGE,
    );
    throwIfErrWithData(modDef);

    const gitRef = modDef.data.gitRef;
    const lastUpdated = new Date().toISOString();

    // Compute new config selections
    const oldConfigSelections = parseModuleConfigSelections(rawModule.config_selections);
    const newConfigSelections = preserveSettings
      ? getMergedModuleConfigSelections(oldConfigSelections, modDef.data.configRequirements)
      : getStartingModuleConfigSelections(modDef.data.configRequirements);

    // Change detection: compare compute-affecting fields
    const storedDef = parseJsonOrThrow<ModuleDefinition>(rawModule.module_definition);
    const scriptChanged = modDef.data.script !== storedDef.script;
    const configReqChanged = JSON.stringify(modDef.data.configRequirements) !== JSON.stringify(storedDef.configRequirements);
    const resultsObjectsChanged = JSON.stringify(modDef.data.resultsObjects) !== JSON.stringify(storedDef.resultsObjects);
    const configSelectionsChanged = JSON.stringify(newConfigSelections.parameterSelections) !== JSON.stringify(oldConfigSelections.parameterSelections);
    const computeChange = scriptChanged || configReqChanged || resultsObjectsChanged;

    if (computeChange) {
      // Scenario B: compute change — full reinstall

      // Delegate to installModule logic (delete + recreate everything)
      const metricIds = modDef.data.metrics.map((m) => m.id);
      const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

      await projectDb.begin(async (sql: Sql) => {
        await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;
        await sql`
INSERT INTO modules
  (id, module_definition, config_selections, dirty, installed_at, script_updated_at, definition_updated_at, config_updated_at, last_run_at, installed_git_ref)
VALUES (
  ${modDef.data.id},
  ${JSON.stringify(modDef.data)},
  ${JSON.stringify(newConfigSelections)},
  'queued',
  ${lastUpdated},
  ${scriptChanged ? lastUpdated : rawModule.script_updated_at},
  ${lastUpdated},
  ${configSelectionsChanged ? lastUpdated : rawModule.config_updated_at},
  ${lastUpdated},
  ${gitRef ?? rawModule.installed_git_ref}
)`;

        for (const resultsObject of modDef.data.resultsObjects) {
          const roTableName = getResultsObjectTableName(resultsObject.id);
          await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
          await sql`
INSERT INTO results_objects (id, module_id, description, column_definitions)
VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
  ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
        }

        for (const metric of modDef.data.metrics) {
          await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props, period_options,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  results_object_id, ai_description, viz_presets, hide, important_notes
) VALUES (
  ${metric.id}, ${modDef.data.id}, ${metric.label}, ${metric.variantLabel ?? null},
  ${metric.valueFunc}, ${metric.formatAs}, ${JSON.stringify(metric.valueProps)},
  ${JSON.stringify(metric.periodOptions ?? [])}, ${JSON.stringify(metric.requiredDisaggregationOptions)},
  ${metric.valueLabelReplacements ? JSON.stringify(metric.valueLabelReplacements) : null},
  ${metric.postAggregationExpression ? JSON.stringify(metric.postAggregationExpression) : null},
  ${metric.resultsObjectId}, ${metric.aiDescription ? JSON.stringify(metric.aiDescription) : null},
  ${metric.vizPresets ? JSON.stringify(metric.vizPresets) : null},
  ${metric.hide ?? false}, ${metric.importantNotes ?? null})`;
        }

        if (metricIds.length > 0) {
          await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
        }
        for (const po of defaultPresentationObjects) {
          await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
          await sql`
INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(po.config)}, ${lastUpdated}, ${po.sortOrder})`;
        }
      });

      if (metricIds.length > 0) {
        await projectDb`UPDATE presentation_objects SET last_updated = ${lastUpdated} WHERE metric_id = ANY(${metricIds})`;
      }
      const allPresObjs = await projectDb<{ id: string }[]>`SELECT id FROM presentation_objects WHERE metric_id = ANY(${metricIds})`;
      return {
        success: true,
        data: { lastUpdated, presObjIdsWithNewLastUpdateds: allPresObjs.map((po) => po.id), computeChange: true },
      };
    }

    // Scenario A: presentation-only update — no table drops
    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;
    const metricIds = modDef.data.metrics.map((m) => m.id);

    await projectDb.begin(async (sql: Sql) => {
      await sql`
        UPDATE modules
        SET
          module_definition = ${JSON.stringify(modDef.data)},
          config_selections = ${JSON.stringify(newConfigSelections)},
          installed_at = ${lastUpdated},
          definition_updated_at = ${lastUpdated},
          installed_git_ref = ${gitRef ?? rawModule.installed_git_ref},
          config_updated_at = ${configSelectionsChanged ? lastUpdated : rawModule.config_updated_at},
          dirty = ${configSelectionsChanged ? 'queued' : rawModule.dirty}
        WHERE id = ${moduleDefinitionId}
      `;

      // Delete and recreate metadata rows (not data tables)
      await sql`DELETE FROM results_objects WHERE module_id = ${modDef.data.id}`;
      await sql`DELETE FROM metrics WHERE module_id = ${modDef.data.id}`;

      for (const resultsObject of modDef.data.resultsObjects) {
        await sql`
INSERT INTO results_objects (id, module_id, description, column_definitions)
VALUES (${resultsObject.id}, ${modDef.data.id}, ${resultsObject.description},
  ${resultsObject.createTableStatementPossibleColumns ? JSON.stringify(resultsObject.createTableStatementPossibleColumns) : null})`;
      }

      for (const metric of modDef.data.metrics) {
        await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props, period_options,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  results_object_id, ai_description, viz_presets, hide, important_notes
) VALUES (
  ${metric.id}, ${modDef.data.id}, ${metric.label}, ${metric.variantLabel ?? null},
  ${metric.valueFunc}, ${metric.formatAs}, ${JSON.stringify(metric.valueProps)},
  ${JSON.stringify(metric.periodOptions ?? [])}, ${JSON.stringify(metric.requiredDisaggregationOptions)},
  ${metric.valueLabelReplacements ? JSON.stringify(metric.valueLabelReplacements) : null},
  ${metric.postAggregationExpression ? JSON.stringify(metric.postAggregationExpression) : null},
  ${metric.resultsObjectId}, ${metric.aiDescription ? JSON.stringify(metric.aiDescription) : null},
  ${metric.vizPresets ? JSON.stringify(metric.vizPresets) : null},
  ${metric.hide ?? false}, ${metric.importantNotes ?? null})`;
      }

      if (metricIds.length > 0) {
        await sql`DELETE FROM presentation_objects WHERE metric_id = ANY(${metricIds}) AND is_default_visualization = TRUE`;
      }
      for (const po of defaultPresentationObjects) {
        await sql`DELETE FROM presentation_objects WHERE id = ${po.id}`;
        await sql`
INSERT INTO presentation_objects (id, metric_id, is_default_visualization, label, config, last_updated, sort_order)
VALUES (${po.id}, ${po.metricId}, ${true}, ${po.label}, ${JSON.stringify(po.config)}, ${lastUpdated}, ${po.sortOrder})`;
      }
    });

    if (metricIds.length > 0) {
      await projectDb`UPDATE presentation_objects SET last_updated = ${lastUpdated} WHERE metric_id = ANY(${metricIds})`;
    }
    const allPresObjs = await projectDb<{ id: string }[]>`SELECT id FROM presentation_objects WHERE metric_id = ANY(${metricIds})`;
    const presObjIdsWithNewLastUpdateds = allPresObjs.map((po) => po.id);

    return {
      success: true,
      data: { lastUpdated, presObjIdsWithNewLastUpdateds, computeChange: configSelectionsChanged },
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
      const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
        rawModule.module_definition,
      );

      return {
        id: getValidatedModuleId(rawModule.id),
        label: moduleDefinition.label,
        dirty: rawModule.dirty as DirtyOrRunStatus,
        hasParameters: (moduleDefinition.configRequirements?.parameters?.length ?? 0) > 0,
        installedAt: rawModule.installed_at,
        scriptUpdatedAt: rawModule.script_updated_at ?? undefined,
        definitionUpdatedAt: rawModule.definition_updated_at ?? undefined,
        configUpdatedAt: rawModule.config_updated_at ?? undefined,
        lastRunAt: rawModule.last_run_at,
        installedGitRef: rawModule.installed_git_ref ?? undefined,
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
    const moduleDefinition: ModuleDefinition = parseJsonOrThrow(
      rawModule.module_definition,
    );
    const module: ModuleDetailForRunningScript = {
      id: getValidatedModuleId(rawModule.id),
      moduleDefinition,
      installedAt: rawModule.installed_at,
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

export async function getMetricsListForAI(
  mainDb: Sql,
  projectDb: Sql,
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
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
      const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
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
              lines.push(`      - ${opt.value} (${getAIStr(opt.label)})`);
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
    // Get facility config once for all modules
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    // Get all metrics from the database
    const rawMetrics = await projectDb<DBMetric[]>`
      SELECT * FROM metrics ORDER BY label
    `;

    const metrics: ResultsValue[] = [];
    for (const dbMetric of rawMetrics) {
      const enrichedMetric = await enrichMetric(
        dbMetric,
        projectDb,
        facilityConfig,
      );
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
    // Get facility config once for all modules
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

      const enrichedMetric = await enrichMetric(
        dbMetric,
        projectDb,
        facilityConfig,
      );

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
        vizPresets: dbMetric.viz_presets ? parseJsonOrThrow(dbMetric.viz_presets) : undefined,
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
      const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
        rawModule.module_definition,
      );

      lines.push(`ID: ${rawModule.id}`);
      lines.push(`Name: ${moduleDefinition.label}`);
      lines.push(`Has Parameters: ${moduleDefinition.configRequirements.parameters.length > 0}`);
      lines.push(`Installed: ${rawModule.installed_at}`);
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

    const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
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
