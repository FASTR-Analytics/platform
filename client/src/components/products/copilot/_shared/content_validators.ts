import { AIToolFailure } from "panther";
import {
  type ContentSlideSplit,
  type DisaggregationOption,
  MAX_CONTENT_BLOCKS,
  type MetricWithStatus,
  SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
  SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET,
  validateDateRange,
  validateFilters,
} from "lib";
import { instanceState } from "~/state/instance/t1_store";

// Slide/report content validators: SPA-only (the copilot's authoring tools).
// The metric-query validators both surfaces run stay in lib/ai_tools
// (validateAiMetricQuery, validateMetricInputsAgainstValueInfo, which the SPA
// reaches through validateMetricInputs); validatePresetOverrides
// composes lib's two primitives so there is one filter validator and one
// date-range validator for every startDate/endDate surface. The text-block
// check, validateTextOnlyMarkdown, is lib's, so a server test pins it.

// The files the slide toolbar's image picker offers.
export function imageAssetFileNames(): string[] {
  return instanceState.assets.filter((a) => a.isImage).map((a) => a.fileName);
}

export function assertImageAsset(imgFile: string): void {
  if (!imageAssetFileNames().includes(imgFile)) {
    throw new AIToolFailure(
      `"${imgFile}" is not one of the instance's image assets. Call get_image_assets for the file names.`,
    );
  }
}

export function assertSplitImageAsset(
  split: ContentSlideSplit | undefined,
): void {
  if (split?.fill.type === "image") assertImageAsset(split.fill.imgFile);
}

export function validateMaxContentBlocks(blocksCount: number): void {
  if (blocksCount > MAX_CONTENT_BLOCKS) {
    throw new AIToolFailure(
      `Too many blocks (${blocksCount}). Maximum is ${MAX_CONTENT_BLOCKS} blocks per slide. Please reduce the number of blocks and try again.`,
    );
  }
}

export function validateSlideTotalWordCount(
  textBlocks: string[],
  max: number = SLIDE_TEXT_TOTAL_WORD_COUNT_MAX,
): void {
  const totalWordCount = textBlocks.reduce((sum, text) => {
    const words = text.trim().split(/\s+/).filter((w) => w.length > 0).length;
    return sum + words;
  }, 0);

  if (totalWordCount > max) {
    throw new AIToolFailure(
      `Slide exceeds maximum word count (${totalWordCount} words across all text blocks). Target: ~${SLIDE_TEXT_TOTAL_WORD_COUNT_TARGET} words per slide, absolute maximum: ${max} words. Please reduce the text length.`,
    );
  }
}

// valuesFilter membership lives in
// generate_visualization/validate_figure_config_edit.ts (validateValuesFilter):
// a pure config check, called by the shared edit validator and the
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
