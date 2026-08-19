import { AIToolFailure } from "panther";
import {
  type DisaggregationOption,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
  validateDateRange,
  validateFilters,
} from "lib";

// Slide/report content validators — SPA-only (the copilot's authoring tools).
// The metric-query validators both surfaces run stay in lib/ai_tools
// (validateAiMetricQuery, validateMetricInputs); validatePresetOverrides
// composes lib's two primitives so there is one filter validator and one
// date-range validator for every startDate/endDate surface.

const MARKDOWN_TABLE_PATTERNS = [
  /\|.*\|.*\|/m, // Lines with multiple pipes (table rows)
  /\|[\s]*[-:]+[\s]*\|/m, // Table separator lines (|---|---|)
];

function containsMarkdownTable(text: string): boolean {
  // BOTH a multi-pipe row and a separator line — a lone piped line ("Region
  // A | Region B | Region C", quoted `a || b || c`) isn't a rendered table
  // and matching on it alone rejected legitimate prose.
  return MARKDOWN_TABLE_PATTERNS.every((pattern) => pattern.test(text));
}

export function validateNoMarkdownTables(markdown: string): void {
  if (containsMarkdownTable(markdown)) {
    throw new AIToolFailure(
      "Markdown tables are not allowed. To display tabular data, use a 'from_metric' block with a table preset, or a 'from_visualization' block.",
    );
  }
}

export function validateMaxContentBlocks(blocksCount: number): void {
  if (blocksCount > MAX_CONTENT_BLOCKS) {
    throw new AIToolFailure(
      `Too many blocks (${blocksCount}). Maximum is ${MAX_CONTENT_BLOCKS} blocks per slide. Please reduce the number of blocks and try again.`,
    );
  }
}

export function validateSlideTotalWordCount(textBlocks: string[]): void {
  const totalWordCount = textBlocks.reduce((sum, text) => {
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    return sum + words;
  }, 0);

  if (totalWordCount > SLIDE_TEXT_TOTAL_WORD_COUNT_MAX) {
    throw new AIToolFailure(
      `Slide exceeds maximum word count (${totalWordCount} words across all text blocks). Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide, absolute maximum: ${SLIDE_TEXT_TOTAL_WORD_COUNT_MAX} words. Please reduce the text length.`,
    );
  }
}

// valuesFilter membership lives in
// generate_visualization/validate_figure_config_edit.ts (validateValuesFilter)
// — a pure config check, called by the shared edit validator and the
// from_metric create path.
export function validatePresetOverrides(
  metricId: string,
  filters:
    | { disOpt: DisaggregationOption; values: (string | number)[] }[]
    | undefined,
  startDate: number | undefined,
  endDate: number | undefined,
  metric?: MetricWithStatus,
): void {
  validateFilters(filters, metricId, metric);
  validateDateRange(startDate, endDate);
}
