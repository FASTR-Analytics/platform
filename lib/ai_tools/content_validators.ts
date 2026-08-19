import type {
  AiMetricQuery,
  DisaggregationOption,
  MetricWithStatus,
  ResultsValueInfoForPresentationObject,
} from "../types/mod.ts";
import { inferPeriodFormatFromValue } from "../types/_metric_installed.ts";
import { convertPeriodValue } from "../convert_period_value.ts";
import { AIToolFailure } from "@timroberton/panther";
import type { AIToolEnv } from "./env.ts";

// The metric-query validators both surfaces run (get_metric_data). The
// slide/report content validators are SPA-only and live in the client
// (project_ai/ai_tools/validators/content_validators.ts); the two
// primitives below are exported because that file's validatePresetOverrides
// composes them — one filter validator and one date-range validator for
// every startDate/endDate surface, never a second copy.

function isPeriodIdValid(val: number): boolean {
  const str = String(val);
  if (str.length !== 6) return false;
  const year = Math.floor(val / 100);
  const month = val % 100;
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
}

function isQuarterIdValid(val: number): boolean {
  const str = String(val);
  if (str.length !== 5) return false;
  const year = Math.floor(val / 10);
  const quarter = val % 10;
  return year >= 1900 && year <= 2100 && quarter >= 1 && quarter <= 4;
}

export function validateFilters(
  filters:
    | { disOpt: DisaggregationOption; values: (string | number)[] }[]
    | undefined,
  metricId: string,
  metric?: MetricWithStatus,
): void {
  if (!filters || !metric) return;

  const availableDims = metric.disaggregationOptions.map((opt) => opt.value);
  const unavailable = filters.filter(
    (f) => !availableDims.includes(f.disOpt),
  );
  if (unavailable.length > 0) {
    throw new AIToolFailure(
      `Filter dimension(s) not available for metric "${metricId}": ${
        unavailable.map((f) => f.disOpt).join(", ")
      }. Available dimensions: ${availableDims.join(", ")}`,
    );
  }
}

export function validateAiMetricQuery(
  query: AiMetricQuery,
  metric?: MetricWithStatus,
): void {
  if (query.disaggregations && metric) {
    const availableDims = metric.disaggregationOptions.map((opt) => opt.value);
    const unavailable = query.disaggregations.filter(
      (d) => !availableDims.includes(d),
    );
    if (unavailable.length > 0) {
      throw new AIToolFailure(
        `Disaggregation(s) not available for metric "${query.metricId}": ${
          unavailable.join(", ")
        }. Available dimensions: ${availableDims.join(", ")}`,
      );
    }
  }

  validateFilters(query.filters, query.metricId, metric);
  validateDateRange(query.startDate, query.endDate);
}

// One date-range validator for every startDate/endDate surface
// (get_metric_data queries AND from_metric preset overrides) — the two used
// to diverge, so an invalid period id one path rejected could reach a stored
// figure config through the other.
export function validateDateRange(
  startDate: number | undefined,
  endDate: number | undefined,
): void {
  // One-sided input used to be silently ignored — the tool reported success
  // while the stored config / query carried no period filter at all (the
  // schema says "must be used together", but saying it is not enforcing it).
  if ((startDate != null) !== (endDate != null)) {
    throw new AIToolFailure(
      `startDate and endDate must be provided together. Got startDate: ${startDate}, endDate: ${endDate}. Provide both for a bounded range, or omit both for all time.`,
    );
  }
  if (startDate != null && endDate != null) {
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
      throw new AIToolFailure(
        `startDate and endDate must be valid numbers. Got startDate: ${startDate}, endDate: ${endDate}`,
      );
    }
    if (startDate > endDate) {
      throw new AIToolFailure(
        `startDate (${startDate}) cannot be greater than endDate (${endDate})`,
      );
    }
    const startDigits = String(startDate).length;
    const endDigits = String(endDate).length;
    if (startDigits !== endDigits) {
      throw new AIToolFailure(
        `startDate and endDate must use the same format. Got startDate: ${startDate} (${startDigits} digits), endDate: ${endDate} (${endDigits} digits)`,
      );
    }
    if (startDigits === 6) {
      if (!isPeriodIdValid(startDate) || !isPeriodIdValid(endDate)) {
        throw new AIToolFailure(
          `Invalid YYYYMM format. Got startDate: ${startDate}, endDate: ${endDate}`,
        );
      }
    } else if (startDigits === 5) {
      if (!isQuarterIdValid(startDate) || !isQuarterIdValid(endDate)) {
        throw new AIToolFailure(
          `Invalid YYYYQ format. Got startDate: ${startDate}, endDate: ${endDate}`,
        );
      }
    } else if (startDigits <= 4) {
      if (startDate < 1900 || endDate > 2100) {
        throw new AIToolFailure(
          `Year must be between 1900 and 2100. Got startDate: ${startDate}, endDate: ${endDate}`,
        );
      }
    }
  } else if (startDate != null || endDate != null) {
    throw new AIToolFailure(
      "Both startDate and endDate must be provided together, or neither.",
    );
  }
}

// The fetching form, for callers that hold only an env (the edit paths). The
// get_metric_data read already holds the value info for its coverage line and
// calls validateMetricInputsAgainstValueInfo directly — one fetch, not two.
export async function validateMetricInputs(
  env: AIToolEnv,
  metricId: string,
  filters?: { disOpt: DisaggregationOption; values: (string | number)[] }[],
  periodFilter?: { min: number; max: number },
): Promise<void> {
  if (!filters?.length && !periodFilter) return;

  const metricInfoRes = await env.getResultsValueInfo(metricId);
  if (!metricInfoRes.success) return;
  validateMetricInputsAgainstValueInfo(
    metricInfoRes.data,
    metricId,
    filters,
    periodFilter,
  );
}

export function validateMetricInputsAgainstValueInfo(
  valueInfo: ResultsValueInfoForPresentationObject,
  metricId: string,
  filters?: { disOpt: DisaggregationOption; values: (string | number)[] }[],
  periodFilter?: { min: number; max: number },
): void {
  if (!filters?.length && !periodFilter) return;

  // getResultsValueInfo writes one entry per real dimension of the metric
  // (whatever its value status), so an ABSENT key means the dimension is not in
  // this metric's results file at all. Fail closed here rather than at the call
  // sites: the edit paths (update_figure, update_report_figure,
  // update_viz_config) run this validator and nothing else, so a filter on a
  // non-existent column would otherwise pass and build a broken fetch config.
  // The create paths already reject it earlier via validateFilters.
  const availableDims = Object.keys(valueInfo.disaggregationPossibleValues);
  for (const filter of filters ?? []) {
    const dimValues = valueInfo.disaggregationPossibleValues[filter.disOpt];
    if (dimValues === undefined) {
      throw new AIToolFailure(
        `Filter dimension "${filter.disOpt}" is not available for metric "${metricId}". ` +
          `Available dimensions: ${
            availableDims.length > 0 ? availableDims.join(", ") : "none"
          }`,
      );
    }
    if (dimValues.status === "ok") {
      const invalid = filter.values.filter((v) =>
        !dimValues.values.some((dv) => dv.id === String(v))
      );
      if (invalid.length > 0) {
        throw new AIToolFailure(
          `Invalid filter value(s) for "${filter.disOpt}": ${
            invalid.join(", ")
          }. ` +
            `Valid: ${
              dimValues.values.map((v) =>
                v.label && v.label !== v.id ? `${v.id} (${v.label})` : v.id
              ).join(", ")
            }`,
        );
      }
    }
  }

  if (periodFilter && valueInfo.periodBounds) {
    const bounds = valueInfo.periodBounds;
    const boundsFmt = inferPeriodFormatFromValue(bounds.min);
    if (boundsFmt !== undefined) {
      const filterMin = convertPeriodValue(periodFilter.min, boundsFmt, false);
      const filterMax = convertPeriodValue(periodFilter.max, boundsFmt, true);
      if (filterMax < bounds.min || filterMin > bounds.max) {
        throw new AIToolFailure(
          `Date range ${periodFilter.min}-${periodFilter.max} is outside available data ` +
            `${bounds.min}-${bounds.max} (${boundsFmt} format).`,
        );
      }
    }
  }
}
