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
  type HfaIndicator,
  type ModuleConfigSelections,
  type ModuleDetailForRunningScript,
  type ModuleId,
  type ResultsValue,
} from "lib";
import { getModuleDefinitionDetail } from "../../module_loader/mod.ts";
import {
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "./../utils.ts";
import { DBModule } from "./_project_database_types.ts";
import { getFacilityColumnsConfig } from "../instance/config.ts";
import { enrichResultsValue } from "./results_value_enricher.ts";

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
  moduleDefinitionId: ModuleId
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
      _INSTANCE_LANGUAGE
    );
    throwIfErrWithData(modDef);
    const lastUpdated = new Date().toISOString();

    const startingConfigSelections = getStartingModuleConfigSelections(
      modDef.data.configRequirements
    );

    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    await projectDb.begin(async (sql: Sql) => {
      await sql`DELETE FROM modules WHERE id = ${modDef.data.id}`;
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
      for (const resultsObject of modDef.data.resultsObjects) {
        const roTableName = getResultsObjectTableName(resultsObject.id);
        await sql`DROP TABLE IF EXISTS ${sql(roTableName)}`;
      }

      await sql`
DELETE FROM presentation_objects
WHERE module_id = ${modDef.data.id} AND is_default_visualization = TRUE
`;

      for (const presObjectDef of defaultPresentationObjects) {
        await sql`
DELETE FROM presentation_objects
WHERE module_id = ${modDef.data.id} AND id = ${presObjectDef.id}
`;
        await sql`
INSERT INTO presentation_objects
  (
    id,
    module_id,
    results_object_id,
    results_value,
    is_default_visualization,
    label,
    config,
    last_updated
  )
VALUES
  (
    ${presObjectDef.id},
    ${modDef.data.id},
    ${presObjectDef.resultsObjectId},
    ${JSON.stringify({ id: presObjectDef.resultsValueId })},
    ${true},
    ${presObjectDef.label},
    ${JSON.stringify(presObjectDef.config)},
    ${lastUpdated}
  )
`;
      }
    });

    await projectDb`
UPDATE presentation_objects
SET last_updated = ${lastUpdated}
WHERE module_id = ${modDef.data.id}
`;

    const allPresObjs = await projectDb<{ id: string }[]>`
SELECT id FROM presentation_objects WHERE module_id = ${modDef.data.id}
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
  moduleId: string
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
      rawModule.module_definition
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
  preserveSettings: boolean
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
      _INSTANCE_LANGUAGE
    );
    throwIfErrWithData(modDef);

    const lastUpdated = new Date().toISOString();

    // Get default presentation objects from the module definition
    const defaultPresentationObjects = modDef.data.defaultPresentationObjects;

    await projectDb.begin(async (sql: Sql) => {
      // Update the module definition and last_updated
      if (preserveSettings) {
        // Merge existing selections with new config requirements
        const oldConfigSelections = parseJsonOrThrow<ModuleConfigSelections>(
          rawModule.config_selections
        );
        const mergedConfigSelections = getMergedModuleConfigSelections(
          oldConfigSelections,
          modDef.data.configRequirements
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
          modDef.data.configRequirements
        );

        await sql`
          UPDATE modules
          SET
            module_definition = ${JSON.stringify(modDef.data)},
            config_selections = ${JSON.stringify(startingConfigSelections)},
            date_installed = ${lastUpdated},
            last_updated = ${lastUpdated}
            dirty = 'queued'
          WHERE id = ${moduleDefinitionId}
        `;
      }

      await sql`
        DELETE FROM presentation_objects
        WHERE module_id = ${modDef.data.id} AND is_default_visualization = TRUE
      `;

      // Update default presentation objects
      for (const presObjectDef of defaultPresentationObjects) {
        await sql`
          DELETE FROM presentation_objects
          WHERE module_id = ${modDef.data.id} AND id = ${presObjectDef.id}
        `;

        await sql`
          INSERT INTO presentation_objects
            (
              id,
              module_id,
              results_object_id,
              results_value,
              is_default_visualization,
              label,
              config,
              last_updated
            )
          VALUES
            (
              ${presObjectDef.id},
              ${modDef.data.id},
              ${presObjectDef.resultsObjectId},
              ${JSON.stringify({ id: presObjectDef.resultsValueId })},
              ${true},
              ${presObjectDef.label},
              ${JSON.stringify(presObjectDef.config)},
              ${lastUpdated}
            )
        `;
      }
    });

    await projectDb`
UPDATE presentation_objects
SET last_updated = ${lastUpdated}
WHERE module_id = ${modDef.data.id}
`;

    const allPresObjs = await projectDb<{ id: string }[]>`
SELECT id FROM presentation_objects WHERE module_id = ${modDef.data.id}
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
  projectDb: Sql
): Promise<APIResponseWithData<InstalledModuleSummary[]>> {
  return await tryCatchDatabaseAsync(async () => {
    const modules = (
      await projectDb<DBModule[]>`
SELECT * FROM modules
`
    ).map<InstalledModuleSummary>((rawModule: DBModule) => {
      const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
        rawModule.module_definition
      );

      return {
        id: getValidatedModuleId(rawModule.id),
        label: moduleDefinition.label,
        moduleDefinitionLastScriptUpdated: moduleDefinition.lastScriptUpdate,
        moduleDefinitionLabel: moduleDefinition.label,
        dateInstalled: rawModule.date_installed,
        moduleDefinitionResultsObjectIds: moduleDefinition.resultsObjects.map(
          (ro) => ro.id
        ),
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
  moduleId: string
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
      rawModule.module_definition
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
  moduleId: string
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

export async function getAllModulesWithResultsValues(
  mainDb: Sql,
  projectDb: Sql
): Promise<APIResponseWithData<InstalledModuleWithResultsValues[]>> {
  return await tryCatchDatabaseAsync(async () => {
    // Get facility config once for all modules
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    const rawModules = await projectDb<DBModule[]>`
      SELECT * FROM modules
    `;

    // Process each module and enrich results values
    const modules = await Promise.all(
      rawModules.map(async (rawModule: DBModule) => {
        const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
          rawModule.module_definition
        );

        const resultsValues: ResultsValue[] = [];

        // Enrich each results value
        for (const resultsObject of moduleDefinition.resultsObjects) {
          for (const resultsValue of resultsObject.resultsValues) {
            const enrichedResultsValue = await enrichResultsValue(
              resultsValue,
              resultsObject.id,
              projectDb,
              facilityConfig
            );
            resultsValues.push(enrichedResultsValue);
          }
        }

        return {
          id: getValidatedModuleId(rawModule.id),
          label: moduleDefinition.label,
          resultsValues,
        };
      })
    );

    // Sort modules alphabetically by label
    modules.sort((a, b) => a.label.localeCompare(b.label));

    return { success: true, data: modules };
  });
}

export async function getModulesListForProject(
  projectDb: Sql
): Promise<APIResponseWithData<string>> {
  return await tryCatchDatabaseAsync(async () => {
    const rawModules = await projectDb<DBModule[]>`
      SELECT * FROM modules ORDER BY id
    `;

    const lines = ["AVAILABLE MODULES", "=".repeat(80), ""];

    for (const rawModule of rawModules) {
      const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
        rawModule.module_definition
      );

      lines.push(`ID: ${rawModule.id}`);
      lines.push(`Name: ${moduleDefinition.label}`);
      lines.push(`Config Type: ${rawModule.config_type}`);
      lines.push(`Installed: ${rawModule.date_installed}`);
      lines.push(`Last Run: ${rawModule.last_run}`);
      lines.push(
        `Status: ${rawModule.dirty === "true" ? "Needs update" : "Up to date"}`
      );

      if (moduleDefinition.resultsObjects.length > 0) {
        lines.push(`Results Objects:`);
        for (const ro of moduleDefinition.resultsObjects) {
          lines.push(
            `  - ${ro.id} (${ro.resultsValues.length} value${
              ro.resultsValues.length === 1 ? "" : "s"
            })`
          );
        }
      }

      lines.push("-".repeat(80));
      lines.push("");
    }

    return { success: true, data: lines.join("\n") };
  });
}

export async function getModuleWithConfigSelections(
  projectDb: Sql,
  moduleId: string
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
      rawModule.module_definition
    );
    const configSelections = parseJsonOrThrow<ModuleConfigSelections>(
      rawModule.config_selections
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
    | { indicators?: HfaIndicator[]; useSampleWeights?: boolean }
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
      rawModule.config_selections
    );

    let updatedConfigSelections: ModuleConfigSelections;
    let updatedModuleDefinition: ModuleDefinition | undefined;

    // Handle different config types
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

      // Also update module_definition to keep indicators in sync
      const currentModuleDefinition = parseJsonOrThrow<ModuleDefinition>(
        rawModule.module_definition
      );
      updatedModuleDefinition = {
        ...currentModuleDefinition,
        configRequirements: {
          ...currentModuleDefinition.configRequirements,
          indicators: updatedConfigSelections.indicators,
        },
      };
    } else {
      throw new Error(
        "Module configuration type does not support parameter updates"
      );
    }

    if (updatedModuleDefinition) {
      await projectDb`
UPDATE modules
SET
  config_selections = ${JSON.stringify(updatedConfigSelections)},
  module_definition = ${JSON.stringify(updatedModuleDefinition)},
  last_updated = ${lastUpdated}
WHERE id = ${moduleId}
`;
    } else {
      await projectDb`
UPDATE modules
SET
  config_selections = ${JSON.stringify(updatedConfigSelections)},
  last_updated = ${lastUpdated}
WHERE id = ${moduleId}
`;
    }
    return { success: true, data: { lastUpdated } };
  });
}
