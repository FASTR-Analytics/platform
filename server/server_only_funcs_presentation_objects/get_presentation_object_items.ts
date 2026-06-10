import { Sql } from "postgres";
import {
  detectColumnExists,
  getResultsObjectTableName,
  tryCatchDatabaseAsync,
} from "../db/mod.ts";
import {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  getPeriodFilterExactBounds,
  ItemsHolderPresentationObject,
  PeriodOption,
} from "lib";
import { MAX_ITEMS } from "./consts.ts";
import { buildCombinedQuery } from "./get_combined_query.ts";
import {
  getDatasetFamilyForModule,
  getIndicatorMetadata,
} from "./get_indicator_metadata.ts";
import { getPeriodBounds } from "./get_period_bounds.ts";
import { buildQueryContext } from "./get_query_context.ts";
import { buildWhereClause } from "./query_helpers.ts";

export async function getPresentationObjectItems(
  mainDb: Sql,
  projectId: string,
  projectDb: Sql,
  resultsObjectId: string,
  fetchConfig: GenericLongFormFetchConfig,
  firstPeriodOption: PeriodOption | undefined,
  moduleLastRun: string,
  datasetsVersion: string,
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  return await tryCatchDatabaseAsync(async () => {
    const roRow = (
      await projectDb<{ module_id: string }[]>`
SELECT module_id FROM results_objects WHERE id = ${resultsObjectId}
`
    ).at(0);
    if (!roRow) throw new Error(`Unknown results object: ${resultsObjectId}`);
    const moduleId = roRow.module_id;

    const tableName = getResultsObjectTableName(resultsObjectId);

    const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleId);

    const queryContext = await buildQueryContext(
      mainDb,
      projectDb,
      tableName,
      fetchConfig,
      datasetFamily,
    );

    // Precise half of the roll-up eligibility rule that validateFetchConfig
    // can't see (it has no table access): AVG without a post-aggregation
    // expression is only re-averageable when rows are raw facility
    // observations. Mirrors isRollupEligibleResultsValue; app clients never
    // send this — guards hand-crafted requests.
    if (
      fetchConfig.includeAdminAreaRollup === true &&
      fetchConfig.postAggregationExpression === undefined &&
      fetchConfig.values.some((v) => v.func === "AVG") &&
      !(await detectColumnExists(projectDb, tableName, "facility_id"))
    ) {
      throw new Error(
        "Invalid includeAdminAreaRollup: AVG values can only be rolled up when the results table has facility-level rows",
      );
    }

    ///////////////////////////
    //                       //
    //    Additional info    //
    //                       //
    ///////////////////////////

    const indicatorMetadata = await getIndicatorMetadata(
      mainDb,
      projectDb,
      moduleId,
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

    // If metric has time data but we couldn't determine valid period bounds,
    // treat as no data available (prevents null period crashes downstream)
    if (firstPeriodOption && !dateRange) {
      const ih: ItemsHolderPresentationObject = {
        projectId,
        resultsObjectId,
        fetchConfig,
        moduleLastRun,
        datasetsVersion,
        dateRange: undefined,
        status: "no_data_available" as const,
      };
      return { success: true, data: ih };
    }

    const resolvedFetchConfig = {
      ...fetchConfig,
      periodFilterExactBounds,
    };

    ///////////////////////////
    //                       //
    //    Execute query      //
    //                       //
    ///////////////////////////

    const sqlQuery = buildCombinedQuery({
      tableName,
      fetchConfig: resolvedFetchConfig,
      queryContext,
      limit: MAX_ITEMS + 1, // Fetch one extra to detect if limit exceeded
    });

    // Execute the query
    const rawItems = await projectDb.unsafe(sqlQuery);

    // Check for special states
    if (rawItems.length > MAX_ITEMS) {
      const ih: ItemsHolderPresentationObject = {
        projectId,
        resultsObjectId,
        fetchConfig,
        moduleLastRun,
        datasetsVersion,
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
        moduleLastRun,
        datasetsVersion,
        dateRange,
        status: "no_data_available" as const,
      };
      return { success: true, data: ih };
    }

    const ih: ItemsHolderPresentationObject = {
      projectId,
      resultsObjectId,
      fetchConfig,
      moduleLastRun,
      datasetsVersion,
      dateRange,
      status: "ok" as const,
      items: rawItems,
      indicatorMetadata,
    };

    return { success: true, data: ih };
  });
}
