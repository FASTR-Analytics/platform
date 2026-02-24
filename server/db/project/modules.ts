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
  type HfaIndicator,
  type MetricStatus,
  type MetricWithStatus,
  METRIC_STATIC_DATA,
  type ModuleConfigSelections,
  type ModuleDetailForRunningScript,
  type ModuleId,
  type ResultsValue,
} from "lib";
import { getModuleDefinitionDetail } from "../../module_loader/mod.ts";
import {
  detectHasAnyRows,
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBMetric, DBModule } from "./_project_database_types.ts";
import { getFacilityColumnsConfig } from "../instance/config.ts";
import { enrichMetric } from "./metric_enricher.ts";

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
  // scriptOnly: boolean
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
    const lastUpdated = new Date().toISOString();

    const startingConfigSelections = getStartingModuleConfigSelections(
      modDef.data.configRequirements,
    );

    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    // Get all metric IDs for this module to find related presentation objects
    const metricIds = modDef.data.metrics.map((m) => m.id);

    await projectDb.begin(async (sql: Sql) => {
      // Delete existing module (cascades to results_objects and metrics)
      await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;

      // Insert module
      await sql`
INSERT INTO modules
  (id, module_definition, date_installed, config_type, config_selections, last_updated, last_run, dirty)
VALUES
  (
    ${modDef.data.id},
    ${JSON.stringify(modDef.data)},
    ${lastUpdated},
    ${modDef.data.configRequirements.configType},
    ${JSON.stringify(startingConfigSelections)},
    ${lastUpdated},
    ${lastUpdated},
    'queued'
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
  auto_include_facility_columns, results_object_id, ai_description
)
VALUES (
  ${metric.id},
  ${modDef.data.id},
  ${metric.label},
  ${metric.variantLabel ?? null},
  ${metric.valueFunc},
  ${metric.formatAs},
  ${JSON.stringify(metric.valueProps)},
  ${JSON.stringify(metric.periodOptions)},
  ${JSON.stringify(metric.requiredDisaggregationOptions)},
  ${metric.valueLabelReplacements ? JSON.stringify(metric.valueLabelReplacements) : null},
  ${metric.postAggregationExpression ? JSON.stringify(metric.postAggregationExpression) : null},
  ${metric.autoIncludeFacilityColumns ?? false},
  ${metric.resultsObjectId},
  ${metric.aiDescription ? JSON.stringify(metric.aiDescription) : null}
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
  }>
> {
  return await tryCatchDatabaseAsync(async () => {
    // First, check if module exists
    const rawModule = (
      await projectDb<DBModule[]>`
        SELECT * FROM modules WHERE id = ${moduleDefinitionId}
      `
    ).at(0);

    if (!rawModule) {
      throw new Error("Module not found");
    }

    // Get the latest module definition
    const modDef = await getModuleDefinitionDetail(
      moduleDefinitionId,
      _INSTANCE_LANGUAGE,
    );
    throwIfErrWithData(modDef);

    const lastUpdated = new Date().toISOString();

    // Get default presentation objects from the module definition
    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    // Get all metric IDs for this module
    const metricIds = modDef.data.metrics.map((m) => m.id);

    await projectDb.begin(async (sql: Sql) => {
      // Update the module definition and last_updated
      if (preserveSettings) {
        // Merge existing selections with new config requirements
        const oldConfigSelections = parseJsonOrThrow<ModuleConfigSelections>(
          rawModule.config_selections,
        );
        const mergedConfigSelections = getMergedModuleConfigSelections(
          oldConfigSelections,
          modDef.data.configRequirements,
        );

        await sql`
          UPDATE modules
          SET
            module_definition = ${JSON.stringify(modDef.data)},
            config_selections = ${JSON.stringify(mergedConfigSelections)},
            date_installed = ${lastUpdated},
            last_updated = ${lastUpdated}
          WHERE id = ${moduleDefinitionId}
        `;
      } else {
        // Reset config_selections to default
        const startingConfigSelections = getStartingModuleConfigSelections(
          modDef.data.configRequirements,
        );

        await sql`
          UPDATE modules
          SET
            module_definition = ${JSON.stringify(modDef.data)},
            config_selections = ${JSON.stringify(startingConfigSelections)},
            date_installed = ${lastUpdated},
            last_updated = ${lastUpdated},
            dirty = 'queued'
          WHERE id = ${moduleDefinitionId}
        `;
      }

      // Delete existing results_objects and metrics (will be recreated)
      await sql`DELETE FROM results_objects WHERE module_id = ${modDef.data.id}`;
      await sql`DELETE FROM metrics WHERE module_id = ${modDef.data.id}`;

      // Recreate results_objects
      for (const resultsObject of modDef.data.resultsObjects) {
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

      // Recreate metrics
      for (const metric of modDef.data.metrics) {
        await sql`
INSERT INTO metrics (
  id, module_id, label, variant_label, value_func, format_as, value_props, period_options,
  required_disaggregation_options, value_label_replacements, post_aggregation_expression,
  auto_include_facility_columns, results_object_id, ai_description
)
VALUES (
  ${metric.id},
  ${modDef.data.id},
  ${metric.label},
  ${metric.variantLabel ?? null},
  ${metric.valueFunc},
  ${metric.formatAs},
  ${JSON.stringify(metric.valueProps)},
  ${JSON.stringify(metric.periodOptions)},
  ${JSON.stringify(metric.requiredDisaggregationOptions)},
  ${metric.valueLabelReplacements ? JSON.stringify(metric.valueLabelReplacements) : null},
  ${metric.postAggregationExpression ? JSON.stringify(metric.postAggregationExpression) : null},
  ${metric.autoIncludeFacilityColumns ?? false},
  ${metric.resultsObjectId},
  ${metric.aiDescription ? JSON.stringify(metric.aiDescription) : null}
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
        moduleDefinitionLastScriptUpdated: moduleDefinition.lastScriptUpdate,
        moduleDefinitionLabel: moduleDefinition.label,
        dateInstalled: rawModule.date_installed,
        lastRun: rawModule.last_run,
        dirty: rawModule.dirty as DirtyOrRunStatus,
        commitSha: moduleDefinition.commitSha,
        latestRanCommitSha: rawModule.latest_ran_commit_sha ?? undefined,
        moduleDefinitionResultsObjectIds:
          resultsObjectIdsByModule.get(rawModule.id) ?? [],
        configType: rawModule.config_type,
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
      dateInstalled: rawModule.date_installed,
      configSelections: parseJsonOrThrow(rawModule.config_selections),
      updateAvailable: true, // Need to fix this
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
      await projectDb<{ last_run: string }[]>`
SELECT last_run FROM modules WHERE id = ${moduleId}
`
    ).at(0);
    if (rawModule === undefined) {
      throw new Error("No module with this definition id");
    }
    return { success: true, data: rawModule.last_run };
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
            `    Period options: ${firstVariant.periodOptions.join(", ")}`,
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
            `    Period options: ${firstVariant.periodOptions.join(", ")}`,
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

    // Enrich each metric
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

    // Enrich each metric and determine status, skipping hidden metrics
    const metrics: MetricWithStatus[] = [];
    for (const dbMetric of rawMetrics) {
      const staticData = METRIC_STATIC_DATA[dbMetric.id];
      if (staticData?.hide) continue;

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
      lines.push(`Config Type: ${rawModule.config_type}`);
      lines.push(`Installed: ${rawModule.date_installed}`);
      lines.push(`Last Run: ${rawModule.last_run}`);
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
    const configSelections = parseJsonOrThrow<ModuleConfigSelections>(
      rawModule.config_selections,
    );

    // Get HFA indicators if this is HFA module
    let hfaIndicators:
      | { var_name: string; example_values: string }[]
      | undefined;
    if (moduleDefinition.configRequirements.configType === "hfa") {
      const hfaIndicatorRows = await projectDb<
        { var_name: string; example_values: string }[]
      >`
        SELECT var_name, example_values FROM indicators_hfa ORDER BY var_name
      `;
      hfaIndicators = hfaIndicatorRows;
    }

    const module: InstalledModuleWithConfigSelections = {
      id: getValidatedModuleId(rawModule.id),
      label: moduleDefinition.label,
      configSelections,
      hfaIndicators,
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
  newParams:
    | Record<string, string>
    | { indicators?: HfaIndicator[]; useSampleWeights?: boolean },
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
    const currentConfigSelections = parseJsonOrThrow<ModuleConfigSelections>(
      rawModule.config_selections,
    );

    let updatedConfigSelections: ModuleConfigSelections;

    if (currentConfigSelections.configType === "parameters") {
      updatedConfigSelections = {
        ...currentConfigSelections,
        parameterSelections: {
          ...currentConfigSelections.parameterSelections,
          ...(newParams as Record<string, string>),
        },
      };
    } else if (currentConfigSelections.configType === "hfa") {
      const hfaParams = newParams as {
        indicators?: HfaIndicator[];
        useSampleWeights?: boolean;
      };
      updatedConfigSelections = {
        ...currentConfigSelections,
        indicators: hfaParams.indicators ?? currentConfigSelections.indicators,
        useSampleWeights:
          hfaParams.useSampleWeights ??
          currentConfigSelections.useSampleWeights,
      };
    } else {
      throw new Error(
        "Module configuration type does not support parameter updates",
      );
    }

    await projectDb`
UPDATE modules
SET
  config_selections = ${JSON.stringify(updatedConfigSelections)},
  last_updated = ${lastUpdated}
WHERE id = ${moduleId}
`;
    return { success: true, data: { lastUpdated } };
  });
}
