import { Sql } from "postgres";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  PeriodBounds,
  ResultsValueInfoForPresentationObject,
  throwIfErrWithData,
} from "lib";
import { getPeriodBounds } from "./get_period_bounds.ts";
import { getPossibleValues } from "./get_possible_values.ts";
import {
  getDatasetFamilyForModule,
  getIndicatorMetadata,
} from "./get_indicator_metadata.ts";
import { resolveMetricById } from "../db/project/results_value_resolver.ts";
import { getFacilityColumnsConfig } from "../db/instance/config.ts";
import { MAX_REPLICANT_OPTIONS } from "./consts.ts";
import type { ItemsVersionInfo } from "./get_presentation_object_items.ts";

// Postgres wrapper — resolves the metric via live enrichment probes, then
// runs the shared status loop with Postgres-backed possible-values queries.
export async function getResultsValueInfoForPresentationObject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  metricId: string,
  moduleLastRun: string,
  datasetsVersion: string,
): Promise<
  APIResponseWithData<ResultsValueInfoForPresentationObject>
> {
  return await tryCatchDatabaseAsync(async () => {
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    const resResultsValue = await resolveMetricById(projectDb, metricId, facilityConfig);
    throwIfErrWithData(resResultsValue);

    // Extract everything from the ResultsValue
    const { resultsValue, moduleId } = resResultsValue.data;
    const resultsObjectId = resultsValue.resultsObjectId;
    const disaggregationOptions = resultsValue.disaggregationOptions
      .map((d) => d.value);
    const firstPeriodOption = resultsValue.mostGranularTimePeriodColumnInResultsFile;

    const tableName = getResultsObjectTableName(resultsObjectId);
    const periodBounds = await getPeriodBounds(
      projectDb,
      tableName,
      [], // No where statements for this use case
      firstPeriodOption,
      undefined, // no filters → no CTE ever needed; columns detected on demand
    );

    // Fetch indicator metadata once for label lookup
    const indicatorMetadata = await getIndicatorMetadata(mainDb, projectDb, moduleId);
    const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

    const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleId);

    return await buildResultsValueInfo(
      projectId,
      metricId,
      resultsObjectId,
      { moduleLastRun, datasetsVersion },
      periodBounds,
      disaggregationOptions,
      (disOpt) =>
        getPossibleValues(
          projectDb,
          resultsObjectId,
          datasetFamily,
          disOpt,
          mainDb,
          labelMap,
        ),
    );
  });
}

// Shared status loop — one source for the ok / too_many_values /
// no_values_available / error thresholds on both engines.
export async function buildResultsValueInfo(
  projectId: string,
  metricId: string,
  resultsObjectId: string,
  versionInfo: ItemsVersionInfo,
  periodBounds: PeriodBounds | undefined,
  disaggregationOptions: DisaggregationOption[],
  getValuesForOption: (
    disOpt: DisaggregationOption,
  ) => Promise<APIResponseWithData<{ id: string; label: string }[]>>,
): Promise<
  APIResponseWithData<ResultsValueInfoForPresentationObject>
> {
  return await tryCatchDatabaseAsync(async () => {
    const disaggregationPossibleValues: {
      [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
    } = {};

    for (const disOpt of disaggregationOptions) {
      const resDisPossibleVals = await getValuesForOption(disOpt);
      if (resDisPossibleVals.success === false) {
        console.warn(
          `[getPossibleValues] failed for ${disOpt} on ${resultsObjectId}: ${resDisPossibleVals.err}`,
        );
        disaggregationPossibleValues[disOpt] = {
          status: "error",
          message: resDisPossibleVals.err,
        };
        continue;
      }

      const vals = resDisPossibleVals.data;

      // Build discriminated union status
      if (vals.length > MAX_REPLICANT_OPTIONS) {
        disaggregationPossibleValues[disOpt] = {
          status: "too_many_values",
        };
      } else if (vals.length === 0) {
        disaggregationPossibleValues[disOpt] = {
          status: "no_values_available",
        };
      } else {
        disaggregationPossibleValues[disOpt] = {
          status: "ok",
          values: vals,
        };
      }
    }

    return {
      success: true,
      data: {
        resultsObjectId,
        metricId,
        projectId,
        ...versionInfo,
        periodBounds,
        disaggregationPossibleValues,
      },
    };
  });
}
