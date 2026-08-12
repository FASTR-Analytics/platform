import { Sql } from "postgres";
import {
  getDatasetFamily,
  ResultsValue,
  type APIResponseWithData,
} from "lib";
import { getStructureSchemaForDatasetFamily } from "../instance/config.ts";
import { DBMetric } from "./_project_database_types.ts";
import { enrichMetric } from "./metric_enricher.ts";

/**
 * Resolves a metric by its ID from the metrics table.
 * Returns a fully enriched ResultsValue with disaggregation options. The
 * facility-column config is the metric's own FAMILY's structure schema
 * (iceh/unknown family → no enabled facility columns).
 */
export async function resolveMetricById(
  mainDb: Sql,
  projectDb: Sql,
  metricId: string,
): Promise<APIResponseWithData<{ resultsValue: ResultsValue; moduleId: string }>> {
  try {
    const dbMetric = (
      await projectDb<DBMetric[]>`
        SELECT * FROM metrics WHERE id = ${metricId}
      `
    ).at(0);

    if (!dbMetric) {
      return { success: false, err: `Metric not found: ${metricId}` };
    }

    const moduleRow = (
      await projectDb<{ module_definition: string }[]>`
        SELECT module_definition FROM modules WHERE id = ${dbMetric.module_id}
      `
    ).at(0);

    const datasetFamily = moduleRow
      ? getDatasetFamily(moduleRow.module_definition)
      : undefined;
    const facilityConfig = await getStructureSchemaForDatasetFamily(
      mainDb,
      datasetFamily ?? undefined,
    );

    const enrichedMetric = await enrichMetric(
      dbMetric,
      projectDb,
      facilityConfig,
      datasetFamily ?? undefined,
    );
    return { success: true, data: { resultsValue: enrichedMetric, moduleId: dbMetric.module_id } };
  } catch (error) {
    return { success: false, err: `Error resolving metric: ${error}` };
  }
}
