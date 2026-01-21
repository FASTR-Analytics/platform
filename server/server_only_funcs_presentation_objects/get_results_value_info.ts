import { Sql } from "postgres";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  PeriodOption,
  ResultsValueInfoForPresentationObject,
  throwIfErrWithData,
} from "lib";
import { getPeriodBounds } from "./get_period_bounds.ts";
import { getPossibleValues } from "./get_possible_values.ts";
import { resolveMetricById } from "../db/project/results_value_resolver.ts";
import { getFacilityColumnsConfig } from "../db/instance/config.ts";
import { MAX_REPLICANT_OPTIONS } from "./consts.ts";

export async function getResultsValueInfoForPresentationObject(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  metricId: string,
  moduleLastRun: string,
): Promise<
  APIResponseWithData<ResultsValueInfoForPresentationObject>
> {
  return await tryCatchDatabaseAsync(async () => {
    // Get facility config
    const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
    const facilityConfig = facilityConfigResult.success
      ? facilityConfigResult.data
      : undefined;

    // Resolve the metric with enrichment
    const resResultsValue = await resolveMetricById(
      projectDb,
      metricId,
      facilityConfig,
    );
    throwIfErrWithData(resResultsValue);

    // Extract everything from the ResultsValue
    const resultsObjectId = resResultsValue.data.resultsObjectId;
    const disaggregationOptions = resResultsValue.data.disaggregationOptions
      .map((d) => d.value);
    const firstPeriodOption = resResultsValue.data.periodOptions?.[0];

    // Call the core logic with all derived values
    return await getResultsObjectVariableInfoCore(
      mainDb,
      projectDb,
      projectId,
      resultsObjectId,
      metricId,
      firstPeriodOption,
      disaggregationOptions,
      moduleLastRun,
    );
  });
}

// Original function - kept for backward compatibility
// export async function getResultsValueInfoForPresentationObject(
//   mainDb: Sql,
//   projectDb: Sql,
//   projectId: string,
//   resultsObjectId: string,
//   firstPeriodOption: PeriodOption | undefined,
//   disaggregationOptions: DisaggregationOption[],
//   moduleLastRun: string
// ): Promise<
//   APIResponseWithData<ResultsValueInfoForPresentationObject>
// > {
//   return await getResultsObjectVariableInfoCore(
//     mainDb,
//     projectDb,
//     projectId,
//     resultsObjectId,
//     firstPeriodOption,
//     disaggregationOptions,
//     moduleLastRun
//   );
// }

// Core logic extracted to avoid duplication
async function getResultsObjectVariableInfoCore(
  mainDb: Sql,
  projectDb: Sql,
  projectId: string,
  resultsObjectId: string,
  metricId: string,
  firstPeriodOption: PeriodOption | undefined,
  disaggregationOptions: DisaggregationOption[],
  moduleLastRun: string,
): Promise<
  APIResponseWithData<ResultsValueInfoForPresentationObject>
> {
  return await tryCatchDatabaseAsync(async () => {
    /////////////////////////
    //                     //
    //    Period bounds    //
    //                     //
    /////////////////////////

    const tableName = getResultsObjectTableName(resultsObjectId);
    const resPeriodBounds = await getPeriodBounds(
      projectDb,
      tableName,
      [], // No where statements for this use case
      firstPeriodOption,
    );
    const periodBounds = resPeriodBounds || undefined;

    ////////////////////////////////
    //                            //
    //    Replicate by options    //
    //                            //
    ////////////////////////////////

    const disaggregationPossibleValues: {
      [key in DisaggregationOption]?: DisaggregationPossibleValuesStatus;
    } = {};

    for (const disOpt of disaggregationOptions) {
      const resDisPossibleVals = await getPossibleValues(
        projectDb,
        resultsObjectId,
        disOpt,
        mainDb,
      );
      if (resDisPossibleVals.success === false) {
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
        moduleLastRun,
        periodBounds,
        disaggregationPossibleValues,
      },
    };
  });
}
