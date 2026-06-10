import { CTEManager } from "./cte_manager.ts";
import {
  applyPostAggregationExpression,
  buildAdminAreaRollupQuery,
  buildMainQuery,
} from "./query_helpers.ts";
import type { QueryConfig } from "./types.ts";

export function buildCombinedQuery(config: QueryConfig): string {
  const { tableName, fetchConfig, queryContext, limit } = config;

  const cteManager = CTEManager.fromQueryConfig(config);
  const periodCTEName = cteManager.getPeriodCTEName();
  const facilityCTEName = cteManager.getFacilityCTEName();
  const sourceTable = periodCTEName || tableName;

  const mainQuery = buildMainQuery(
    sourceTable,
    fetchConfig,
    queryContext,
    facilityCTEName,
  );

  const rollupQuery = buildAdminAreaRollupQuery(
    sourceTable,
    fetchConfig,
    queryContext,
    facilityCTEName,
  );

  let combinedQuery = mainQuery;
  if (rollupQuery) {
    combinedQuery = `${mainQuery}\nUNION ALL\n${rollupQuery}`;
  }

  const queryWithPostAggregation = applyPostAggregationExpression(
    combinedQuery,
    fetchConfig.postAggregationExpression,
    fetchConfig.groupBys,
  );

  const withClause = cteManager.emitWITHClause();
  let finalQuery = withClause
    ? `${withClause}\n${queryWithPostAggregation}`
    : queryWithPostAggregation;

  // LIMIT prevents excessive data fetching
  finalQuery = `${finalQuery}\nLIMIT ${limit}`;

  return finalQuery;
}
