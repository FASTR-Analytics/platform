import { tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  GenericLongFormFetchConfig,
  getPeriodFilterExactBounds,
  IndicatorMetadata,
  ItemsHolderPresentationObject,
  JsonArrayItem,
  PeriodOption,
} from "lib";
import { MAX_ITEMS } from "./consts.ts";
import { buildCombinedQuery } from "./get_combined_query.ts";
import { getPeriodBoundsCore } from "./get_period_bounds.ts";
import { buildWhereClause } from "./query_helpers.ts";
import type { QueryContext, SqlRowsExecutor } from "./types.ts";

export type ItemsQueryDeps = {
  execute: SqlRowsExecutor;
  columnExists: (tableName: string, columnName: string) => Promise<boolean>;
  getIndicatorMetadata: () => Promise<IndicatorMetadata[]>;
};

export type ItemsVersionInfo = {
  moduleLastRun: string;
  datasetsVersion: string;
  // Set by the run read path: the cache identity (PLAN_RESULTS_RUNS §2.5) and
  // the scope the payload was computed under (SYSTEM_09 "AA2 scope
  // injection"). The PO caches refuse to store a payload missing either
  // rather than mis-key it.
  runId?: string;
  scopeToken?: string;
};

export async function getPresentationObjectItemsCore(
  deps: ItemsQueryDeps,
  resultsObjectId: string,
  tableName: string,
  queryContext: QueryContext,
  fetchConfig: GenericLongFormFetchConfig,
  firstPeriodOption: PeriodOption | undefined,
  versionInfo: ItemsVersionInfo,
): Promise<APIResponseWithData<ItemsHolderPresentationObject>> {
  return await tryCatchDatabaseAsync(async () => {
    // Precise half of the roll-up eligibility rule that validateFetchConfig
    // can't see (it has no table access): AVG without a post-aggregation
    // expression is only re-averageable when rows are raw facility
    // observations. Mirrors isRollupEligibleResultsValue; app clients never
    // send this — guards hand-crafted requests.
    if (
      fetchConfig.rollupDim !== undefined &&
      fetchConfig.postAggregationExpression === undefined &&
      fetchConfig.values.some((v) => v.func === "AVG") &&
      !queryContext.hasFacilityId
    ) {
      throw new Error(
        "Invalid rollupDim: AVG values can only be rolled up when the results table has facility-level rows",
      );
    }

    ///////////////////////////
    //                       //
    //    Additional info    //
    //                       //
    ///////////////////////////

    const indicatorMetadata = await deps.getIndicatorMetadata();

    const nonFacilityFetchConfig = {
      ...fetchConfig,
      filters: queryContext.nonFacilityFilters,
    };

    const nonFacilityWhereStatements = buildWhereClause(
      nonFacilityFetchConfig,
      queryContext.hasPeriodId,
      undefined,
      queryContext,
    );

    const rawDateRange = await getPeriodBoundsCore(
      deps.execute,
      tableName,
      nonFacilityWhereStatements,
      firstPeriodOption,
      {
        hasPeriodId: queryContext.hasPeriodId,
        hasQuarterId: queryContext.hasQuarterId,
        neededPeriodColumns: queryContext.neededPeriodColumns,
        calendar: queryContext.calendar,
      },
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
        resultsObjectId,
        fetchConfig,
        ...versionInfo,
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
    const rawItems = await deps.execute(sqlQuery);

    // Check for special states
    if (rawItems.length > MAX_ITEMS) {
      const ih: ItemsHolderPresentationObject = {
        resultsObjectId,
        fetchConfig,
        ...versionInfo,
        dateRange,
        status: "too_many_items" as const,
      };
      return { success: true, data: ih };
    }

    if (rawItems.length === 0) {
      const ih: ItemsHolderPresentationObject = {
        resultsObjectId,
        fetchConfig,
        ...versionInfo,
        dateRange,
        status: "no_data_available" as const,
      };
      return { success: true, data: ih };
    }

    const ih: ItemsHolderPresentationObject = {
      resultsObjectId,
      fetchConfig,
      ...versionInfo,
      dateRange,
      status: "ok" as const,
      items: rawItems as JsonArrayItem[],
      indicatorMetadata,
    };

    return { success: true, data: ih };
  });
}
