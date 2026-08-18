import { Sql } from "postgres";
import { getResultsObjectTableName, tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  DatasetType,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  type IndicatorFormat,
  type IndicatorMetadata,
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
import { exceedsMaxReplicantOptions } from "./consts.ts";
import type { ItemsVersionInfo } from "./get_presentation_object_items.ts";

// Postgres wrapper — resolves the metric via live enrichment probes, then
// runs the shared status loop with Postgres-backed possible-values queries.
export async function getResultsValueInfoForPresentationObject(
  mainDb: Sql,
  projectDb: Sql,
  metricId: string,
  moduleLastRun: string,
  datasetsVersion: string,
): Promise<
  APIResponseWithData<ResultsValueInfoForPresentationObject>
> {
  return await tryCatchDatabaseAsync(async () => {
    const resResultsValue = await resolveMetricById(mainDb, projectDb, metricId);
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

    // Fetch indicator metadata once, for label lookup and the format map
    const indicatorMetadata = await getIndicatorMetadata(projectDb, moduleId);
    const labelMap = new Map(indicatorMetadata.map((m) => [m.id, m.label]));

    const datasetFamily = await getDatasetFamilyForModule(projectDb, moduleId);

    return await buildResultsValueInfo(
      metricId,
      resultsObjectId,
      resultsValue.datasetFamily,
      { moduleLastRun, datasetsVersion },
      periodBounds,
      disaggregationOptions,
      indicatorFormatsFrom(indicatorMetadata),
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
  metricId: string,
  resultsObjectId: string,
  datasetFamily: DatasetType | undefined,
  versionInfo: ItemsVersionInfo,
  periodBounds: PeriodBounds | undefined,
  disaggregationOptions: DisaggregationOption[],
  indicatorFormats: Record<string, IndicatorFormat>,
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
      if (exceedsMaxReplicantOptions(vals)) {
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
        datasetFamily,
        ...versionInfo,
        periodBounds,
        disaggregationPossibleValues,
        indicatorFormats,
      },
    };
  });
}

// The subset of IndicatorMetadata that declares a format. Entries without one
// (HFA categories, raw HMIS indicators) are omitted rather than defaulted —
// resolveEffectiveFormat treats an absent id as "says nothing", which is not
// the same as "says number".
export function indicatorFormatsFrom(
  metadata: IndicatorMetadata[],
): Record<string, IndicatorFormat> {
  const formats: Record<string, IndicatorFormat> = {};
  for (const m of metadata) {
    if (m.format_as !== undefined) {
      formats[m.id] = m.format_as;
    }
  }
  return formats;
}
