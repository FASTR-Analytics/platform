import {
  MAX_CONTENT_BLOCKS,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
  type AiMetricQuery,
  type DisaggregationOption,
  type MetricWithStatus,
  type PeriodOption,
} from "lib";
import { convertPeriodValue } from "~/components/slide_deck/slide_ai/build_config_from_metric";
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
      "Markdown tables are not allowed. To display tabular data, use a 'from_metric' block with a table preset, or a 'from_visualization' block."
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

export function validateSlideTotalWordCount(textBlocks: string[]): void {
  const totalWordCount = textBlocks.reduce((sum, text) => {
    const words = text.trim().split(/\s+/).filter(w => w.length > 0).length;
    return sum + words;
  }, 0);

  if (totalWordCount > SLIDE_TEXT_TOTAL_WORD_COUNT_MAX) {
    throw new Error(
      `Slide exceeds maximum word count (${totalWordCount} words across all text blocks). Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide, absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words. Please reduce the text length.`
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

function validateFilters(
  filters: { disOpt: DisaggregationOption; values: (string | number)[] }[] | undefined,
  metricId: string,
  metric?: MetricWithStatus
): void {
  if (!filters || !metric) return;

  const availableDims = metric.disaggregationOptions.map(opt => opt.value);
  const unavailable = filters.filter(
    f => !availableDims.includes(f.disOpt)
  );
  if (unavailable.length > 0) {
    throw new Error(
      `Filter dimension(s) not available for metric "${metricId}": ${unavailable.map(f => f.disOpt).join(", ")}. Available dimensions: ${availableDims.join(", ")}`
    );
  }
}

export function validateAiMetricQuery(query: AiMetricQuery, metric?: MetricWithStatus): void {
  if (query.disaggregations && metric) {
    const availableDims = metric.disaggregationOptions.map(opt => opt.value);
    const unavailable = query.disaggregations.filter(
      d => !availableDims.includes(d)
    );
    if (unavailable.length > 0) {
      throw new Error(
        `Disaggregation(s) not available for metric "${query.metricId}": ${unavailable.join(", ")}. Available dimensions: ${availableDims.join(", ")}`
      );
    }
  }

  validateFilters(query.filters, query.metricId, metric);

  if (query.startDate != null && query.endDate != null) {
    if (!Number.isFinite(query.startDate) || !Number.isFinite(query.endDate)) {
      throw new Error(
        `startDate and endDate must be valid numbers. Got startDate: ${query.startDate}, endDate: ${query.endDate}`
      );
    }
    if (query.startDate > query.endDate) {
      throw new Error(
        `startDate (${query.startDate}) cannot be greater than endDate (${query.endDate})`
      );
    }
    const startDigits = String(query.startDate).length;
    const endDigits = String(query.endDate).length;
    if (startDigits !== endDigits) {
      throw new Error(
        `startDate and endDate must use the same format. Got startDate: ${query.startDate} (${startDigits} digits), endDate: ${query.endDate} (${endDigits} digits)`
      );
    }
    if (startDigits === 6) {
      if (!isPeriodIdValid(query.startDate) || !isPeriodIdValid(query.endDate)) {
        throw new Error(
          `Invalid YYYYMM format. Got startDate: ${query.startDate}, endDate: ${query.endDate}`
        );
      }
    } else if (startDigits <= 4) {
      if (query.startDate < 1900 || query.endDate > 2100) {
        throw new Error(
          `Year must be between 1900 and 2100. Got startDate: ${query.startDate}, endDate: ${query.endDate}`
        );
      }
    }
  } else if (query.startDate != null || query.endDate != null) {
    throw new Error(
      "Both startDate and endDate must be provided together, or neither."
    );
  }

}

export function validatePresetOverrides(
  metricId: string,
  filters: { disOpt: DisaggregationOption; values: (string | number)[] }[] | undefined,
  startDate: number | undefined,
  endDate: number | undefined,
  metric?: MetricWithStatus,
): void {
  validateFilters(filters, metricId, metric);

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
  filters?: { disOpt: DisaggregationOption; values: (string | number)[] }[],
  periodFilter?: { periodOption: PeriodOption; min: number; max: number },
): Promise<void> {
  if (!filters?.length && !periodFilter) return;

  const metricInfoRes = await getResultsValueInfoForPresentationObjectFromCacheOrFetch(
    projectId,
    metricId,
  );
  if (!metricInfoRes.success) return;

  for (const filter of filters ?? []) {
    const dimValues = metricInfoRes.data.disaggregationPossibleValues[filter.disOpt];
    if (dimValues?.status === "ok") {
      const invalid = filter.values.filter(v => !dimValues.values.some(dv => String(dv) === String(v)));
      if (invalid.length > 0) {
        throw new Error(
          `Invalid filter value(s) for "${filter.disOpt}": ${invalid.join(", ")}. ` +
          `Valid: ${dimValues.values.join(", ")}`
        );
      }
    }
  }

  if (periodFilter && metricInfoRes.data.periodBounds) {
    const bounds = metricInfoRes.data.periodBounds;
    const filterMin = convertPeriodValue(periodFilter.min, bounds.periodOption, false);
    const filterMax = convertPeriodValue(periodFilter.max, bounds.periodOption, true);
    if (filterMax < bounds.min || filterMin > bounds.max) {
      throw new Error(
        `Date range ${periodFilter.min}-${periodFilter.max} is outside available data ` +
        `${bounds.min}-${bounds.max} (${bounds.periodOption} format).`
      );
    }
  }
}
