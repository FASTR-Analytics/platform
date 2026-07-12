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
  IndicatorMetadata,
  ItemsHolderPresentationObject,
  JsonArrayItem,
  PeriodOption,
} from "lib";
import { MAX_ITEMS } from "./consts.ts";
import { buildCombinedQuery } from "./get_combined_query.ts";
import {
  getDatasetFamilyForModule,
  getIndicatorMetadata,
} from "./get_indicator_metadata.ts";
import { getPeriodBoundsCore } from "./get_period_bounds.ts";
import { buildQueryContext } from "./get_query_context.ts";
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
  // Set by the run read path (the cache identity, PLAN_RESULTS_RUNS §2.5);
  // absent from the Postgres wrappers (the parity rig's baseline).
  runId?: string;
};

// Postgres wrapper — probes and executes on the project DB.
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

    return await getPresentationObjectItemsCore(
      {
        execute: (sql) => projectDb.unsafe(sql),
        columnExists: (table, column) =>
          detectColumnExists(projectDb, table, column),
        getIndicatorMetadata: () =>
          getIndicatorMetadata(mainDb, projectDb, moduleId),
      },
      projectId,
      resultsObjectId,
      tableName,
      queryContext,
      fetchConfig,
      firstPeriodOption,
      { moduleLastRun, datasetsVersion },
    );
  });
}

export async function getPresentationObjectItemsCore(
  deps: ItemsQueryDeps,
  projectId: string,
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
      fetchConfig.includeAdminAreaRollup === true &&
      fetchConfig.postAggregationExpression === undefined &&
      fetchConfig.values.some((v) => v.func === "AVG") &&
      !(await deps.columnExists(tableName, "facility_id"))
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

    const indicatorMetadata = await deps.getIndicatorMetadata();

    const nonFacilityFetchConfig = {
      ...fetchConfig,
      filters: queryContext.nonFacilityFilters,
    };

    const nonFacilityWhereStatements = buildWhereClause(
      nonFacilityFetchConfig,
      queryContext.hasPeriodId,
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
        projectId,
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
        projectId,
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
        projectId,
        resultsObjectId,
        fetchConfig,
        ...versionInfo,
        dateRange,
        status: "no_data_available" as const,
      };
      return { success: true, data: ih };
    }

    const ih: ItemsHolderPresentationObject = {
      projectId,
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
