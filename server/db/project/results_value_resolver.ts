import { Sql } from "postgres";
import {
  ResultsValue,
  type APIResponseWithData,
  type InstanceConfigFacilityColumns,
} from "lib";
import { DBMetric } from "./_project_database_types.ts";
import { enrichMetric } from "./metric_enricher.ts";

/**
 * Resolves a metric by its ID from the metrics table.
 * Returns a fully enriched ResultsValue with disaggregation options.
 */
export async function resolveMetricById(
  projectDb: Sql,
  metricId: string,
  facilityConfig?: InstanceConfigFacilityColumns
): Promise<APIResponseWithData<ResultsValue>> {
  try {
    const dbMetric = (
      await projectDb<DBMetric[]>`
        SELECT * FROM metrics WHERE id = ${metricId}
      `
    ).at(0);

    if (!dbMetric) {
      return { success: false, err: `Metric not found: ${metricId}` };
    }

    const enrichedMetric = await enrichMetric(dbMetric, projectDb, facilityConfig);
    return { success: true, data: enrichedMetric };
  } catch (error) {
    return { success: false, err: `Error resolving metric: ${error}` };
  }
}
