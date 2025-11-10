import { Sql } from "postgres";
import {
  ModuleDefinition,
  ResultsValue,
  parseJsonOrThrow,
  type APIResponseWithData,
  type InstanceConfigFacilityColumns,
  type ResultsValueDefinition,
} from "lib";
import { DBModule } from "./_project_database_types.ts";
import { enrichResultsValue } from "./results_value_enricher.ts";

export async function resolveResultsValueFromInstalledModule(
  projectDb: Sql,
  moduleId: string,
  resultsValueId: string,
  facilityConfig?: InstanceConfigFacilityColumns
): Promise<APIResponseWithData<ResultsValue>> {
  try {
    // Query the installed module from the modules table
    const rawModule = (
      await projectDb<DBModule[]>`
        SELECT module_definition FROM modules WHERE id = ${moduleId}
      `
    ).at(0);

    if (!rawModule) {
      return { success: false, err: `Module not found: ${moduleId}` };
    }

    // Parse the module definition
    const moduleDefinition = parseJsonOrThrow<ModuleDefinition>(
      rawModule.module_definition
    );

    // Search for the ResultsValue in all resultsObjects
    let foundResultsValue: ResultsValueDefinition | null = null;
    for (const resultsObject of moduleDefinition.resultsObjects) {
      for (const resultsValue of resultsObject.resultsValues) {
        if (resultsValue.id === resultsValueId) {
          foundResultsValue = resultsValue;
          break;
        }
      }
      if (foundResultsValue) break;
    }

    if (!foundResultsValue) {
      return {
        success: false,
        err: `ResultsValue not found: ${resultsValueId} in module ${moduleId}`,
      };
    }

    // Use the enricher to handle all enrichment logic including facility columns
    const enrichedResultsValue = await enrichResultsValue(
      foundResultsValue,
      foundResultsValue.resultsObjectId,
      projectDb,
      facilityConfig
    );

    return { success: true, data: enrichedResultsValue };
  } catch (error) {
    return { success: false, err: `Error resolving ResultsValue: ${error}` };
  }
}
