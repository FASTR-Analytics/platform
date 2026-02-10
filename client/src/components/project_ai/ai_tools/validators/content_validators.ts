import { ALL_DISAGGREGATION_OPTIONS, type AiMetricQuery, type DisaggregationOption, type MetricWithStatus, type PeriodOption, MAX_CONTENT_BLOCKS } from "lib";
import { getResultsValueInfoForPresentationObjectFromCacheOrFetch } from "~/state/po_cache";

const MARKDOWN_TABLE_PATTERNS = [
  /\|.*\|.*\|/m, // Lines with multiple pipes (table rows)
  /\|[\s]*[-:]+[\s]*\|/m, // Table separator lines (|---|---|)
];

function containsMarkdownTable(text: string): boolean {
  return MARKDOWN_TABLE_PATTERNS.some((pattern) => pattern.test(text));
}

export function validateNoMarkdownTables(markdown: string): void {
  if (containsMarkdownTable(markdown)) {
    throw new Error(
      "Markdown tables are not allowed. To display tabular data, you must create a table figure using 'from_metric' or 'from_visualization' with chartType='table' instead of using markdown table syntax (pipes and dashes)."
    );
  }
}

export function validateMaxContentBlocks(blocksCount: number): void {
  if (blocksCount > MAX_CONTENT_BLOCKS) {
    throw new Error(
      `Too many blocks (${blocksCount}). Maximum is ${MAX_CONTENT_BLOCKS} blocks per slide. Please reduce the number of blocks and try again.`
    );
  }
}

function isPeriodIdValid(val: number): boolean {
  const str = String(val);
  if (str.length !== 6) return false;
  const year = Math.floor(val / 100);
  const month = val % 100;
  return year >= 1900 && year <= 2100 && month >= 1 && month <= 12;
}

function isQuarterIdValid(val: number): boolean {
  const str = String(val);
  if (str.length !== 6) return false;
  const year = Math.floor(val / 100);
  const quarter = val % 100;
  return year >= 1900 && year <= 2100 && quarter >= 1 && quarter <= 4;
}

function validateFilters(
  filters: { col: string; vals: string[] }[] | undefined,
  metricId: string,
  metric?: MetricWithStatus
): void {
  if (!filters) return;

  const invalidCols = filters.filter(
    f => !ALL_DISAGGREGATION_OPTIONS.includes(f.col)
  );
  if (invalidCols.length > 0) {
    throw new Error(
      `Invalid filter column(s): ${invalidCols.map(f => f.col).join(", ")}. Valid columns are: ${ALL_DISAGGREGATION_OPTIONS.join(", ")}`
    );
  }

  if (metric) {
    const availableDims = metric.disaggregationOptions.map(opt => opt.value);
    const unavailable = filters.filter(
      f => !availableDims.includes(f.col as any)
    );
    if (unavailable.length > 0) {
      throw new Error(
        `Filter dimension(s) not available for metric "${metricId}": ${unavailable.map(f => f.col).join(", ")}. Available dimensions: ${availableDims.join(", ")}`
      );
    }
  }

  const emptyFilters = filters.filter(f => !f.vals || f.vals.length === 0);
  if (emptyFilters.length > 0) {
    throw new Error(
      `Filter values cannot be empty for dimension(s): ${emptyFilters.map(f => f.col).join(", ")}. You must specify at least one value to filter by. Use get_metric_data to see available values.`
    );
  }
}

export function validateAiMetricQuery(query: AiMetricQuery, metric?: MetricWithStatus): void {
  if (query.disaggregations) {
    const invalid = query.disaggregations.filter(
      d => !ALL_DISAGGREGATION_OPTIONS.includes(d)
    );
    if (invalid.length > 0) {
      throw new Error(
        `Invalid disaggregation option(s): ${invalid.join(", ")}. Valid options are: ${ALL_DISAGGREGATION_OPTIONS.join(", ")}`
      );
    }

    if (metric) {
      const availableDims = metric.disaggregationOptions.map(opt => opt.value);
      const unavailable = query.disaggregations.filter(
        d => !availableDims.includes(d as any)
      );
      if (unavailable.length > 0) {
        throw new Error(
          `Disaggregation(s) not available for metric "${query.metricId}": ${unavailable.join(", ")}. Available dimensions: ${availableDims.join(", ")}`
        );
      }
    }
  }

  validateFilters(query.filters, query.metricId, metric);

  if (query.periodFilter) {
    const { periodOption, min, max } = query.periodFilter;

    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      throw new Error(
        `Period filter min and max must be valid numbers. Got min: ${min}, max: ${max}`
      );
    }

    if (min > max) {
      throw new Error(
        `Period filter min (${min}) cannot be greater than max (${max})`
      );
    }

    if (periodOption === "period_id") {
      if (!isPeriodIdValid(min) || !isPeriodIdValid(max)) {
        throw new Error(
          `Invalid period_id format. Must be YYYYMM (e.g., 202301 for Jan 2023). Got min: ${min}, max: ${max}`
        );
      }
    } else if (periodOption === "quarter_id") {
      if (!isQuarterIdValid(min) || !isQuarterIdValid(max)) {
        throw new Error(
          `Invalid quarter_id format. Must be YYYYQQ where QQ is 01-04 (e.g., 202301 for Q1 2023). Got min: ${min}, max: ${max}`
        );
      }
    } else if (periodOption === "year") {
      if (min < 1900 || max > 2100) {
        throw new Error(
          `Year must be between 1900 and 2100. Got min: ${min}, max: ${max}`
        );
      }
    }
  }

  if (query.valuesFilter && metric) {
    const invalidValues = query.valuesFilter.filter(
      v => !metric.valueProps.includes(v)
    );
    if (invalidValues.length > 0) {
      throw new Error(
        `Invalid valuesFilter value(s): ${invalidValues.join(", ")}. Valid values for metric "${query.metricId}" are: ${metric.valueProps.join(", ")}`
      );
    }
  }
}

export function validatePresetOverrides(
  metricId: string,
  filterOverrides: { col: string; vals: string[] }[] | undefined,
  startDate: number | undefined,
  endDate: number | undefined,
  metric?: MetricWithStatus,
): void {
  validateFilters(filterOverrides, metricId, metric);

  if (startDate != null && endDate != null) {
    if (!Number.isFinite(startDate) || !Number.isFinite(endDate)) {
      throw new Error(
        `startDate and endDate must be valid numbers. Got startDate: ${startDate}, endDate: ${endDate}`
      );
    }

    if (startDate > endDate) {
      throw new Error(
        `startDate (${startDate}) cannot be greater than endDate (${endDate})`
      );
    }
  } else if (startDate != null || endDate != null) {
    throw new Error(
      "Both startDate and endDate must be provided together, or neither."
    );
  }
}

export async function validateMetricInputs(
  projectId: string,
  metricId: string,
  filters?: { col: string; vals: string[] }[],
  periodFilter?: { periodOption: PeriodOption; min: number; max: number },
): Promise<void> {
  if (!filters?.length && !periodFilter) return;

  const metricInfoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
    projectId,
    metricId,
  );
  if (!metricInfoRes.success) return;

  for (const filter of filters ?? []) {
    const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.col as DisaggregationOption];
    if (dimValues?.status === "ok") {
      const invalid = filter.vals.filter(v => !dimValues.values.includes(v));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid filter value(s) for "${filter.col}": ${invalid.join(", ")}. ` +
          `Valid: ${dimValues.values.join(", ")}`
        );
      }
    }
  }

  if (periodFilter && metricInfoRes.data.periodBounds) {
    const bounds = metricInfoRes.data.periodBounds;
    if (periodFilter.max < bounds.min || periodFilter.min > bounds.max) {
      throw new Error(
        `Date range ${periodFilter.min}-${periodFilter.max} is outside available data ` +
        `${bounds.min}-${bounds.max} (${periodFilter.periodOption} format).`
      );
    }
  }
}
