import { Sql } from "postgres";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  getPeriodFilterExactBounds,
  ItemsHolderPresentationObject,
  PeriodOption,
} from "lib";
import { MAX_ITEMS } from "./consts.ts";
import { buildCombinedQueryV2 } from "./get_combined_query.ts";
import { getIndicatorLabelReplacements } from "./get_indicator_label_replacements.ts";
import { getPeriodBounds } from "./get_period_bounds.ts";
import { buildQueryContext } from "./get_query_context.ts";
import { buildWhereClause } from "./query_helpers.ts";

export async function getPresentationObjectItems(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  presentationObjectId: string,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
  firstPeriodOption: PeriodOption | undefined,
  moduleLastRun: string,
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  return await tryCatchDatabaseAsync(async () => {
    const poData = (
      await projectDb<{ module_id: string; last_updated: string }[]>`
SELECT module_id, last_updated FROM presentation_objects WHERE id = ${presentationObjectId}
`
    ).at(0);

    if (!poData) {
      throw new Error("Presentation object not found");
    }

    const tableName = getResultsObjectTableName(resultsObjectId);

    const queryContext = await buildQueryContext(
      mainDb,
      projectDb,
      tableName,
      fetchConfig,
    );

    ///////////////////////////
    //                       //
    //    Additional info    //
    //                       //
    ///////////////////////////

    const indicatorLabelReplacements = await getIndicatorLabelReplacements(
      projectDb,
      poData.module_id,
    );

    const nonFacilityFetchConfig = {
      ...fetchConfig,
      filters: queryContext.nonFacilityFilters,
    };

    const nonFacilityWhereStatements = buildWhereClause(
      nonFacilityFetchConfig,
      queryContext.hasPeriodId,
    );

    const rawDateRange = await getPeriodBounds(
      projectDb,
      tableName,
      nonFacilityWhereStatements,
      firstPeriodOption,
      queryContext.hasPeriodId,
    );

    ///////////////////////////
    //                       //
    //    Resolve filter     //
    //                       //
    ///////////////////////////

    const periodFilterExactBounds = getPeriodFilterExactBounds(
      fetchConfig.periodFilter,
      rawDateRange,
    );

    // Use resolved period bounds as dateRange when period filter is active
    const dateRange = periodFilterExactBounds ?? rawDateRange;

    const resolvedFetchConfig = {
      ...fetchConfig,
      periodFilterExactBounds,
    };

    ///////////////////////////
    //                       //
    //    Execute query      //
    //                       //
    ///////////////////////////

    const query = buildCombinedQueryV2({
      tableName,
      fetchConfig: resolvedFetchConfig,
      queryContext,
      limit: MAX_ITEMS + 1, // Fetch one extra to detect if limit exceeded
    });

    // Execute the query
    const rawItems = await projectDb.unsafe(query);

    // Check for special states
    if (rawItems.length > MAX_ITEMS) {
      const ih: ItemsHolderPresentationObject = {
        projectId,
        resultsObjectId,
        fetchConfig,
        presentationObjectLastUpdated: poData.last_updated,
        moduleLastRun,
        dateRange,
        status: "too_many_items" as const,
      };
      return { success: true, data: ih };
    }

    if (rawItems.length === 0) {
      const ih: ItemsHolderPresentationObject = {
        projectId,
        resultsObjectId,
        fetchConfig,
        presentationObjectLastUpdated: poData.last_updated,
        moduleLastRun,
        dateRange,
        status: "no_data_available" as const,
      };
      return { success: true, data: ih };
    }

    const ih: ItemsHolderPresentationObject = {
      projectId,
      resultsObjectId,
      fetchConfig,
      presentationObjectLastUpdated: poData.last_updated,
      moduleLastRun,
      dateRange,
      status: "ok" as const,
      items: rawItems,
      indicatorLabelReplacements,
    };

    return { success: true, data: ih };
  });
}
