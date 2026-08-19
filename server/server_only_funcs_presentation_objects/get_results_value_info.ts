import { tryCatchDatabaseAsync } from "../db/mod.ts";
import {
  APIResponseWithData,
  DatasetType,
  DisaggregationOption,
  DisaggregationPossibleValuesStatus,
  type IndicatorFormat,
  type IndicatorMetadata,
  PeriodBounds,
  ResultsValueInfoForPresentationObject,
} from "lib";
import { exceedsMaxReplicantOptions } from "./consts.ts";
import type { ItemsVersionInfo } from "./get_presentation_object_items.ts";

// The status loop — one source for the ok / too_many_values /
// no_values_available / error thresholds.
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
