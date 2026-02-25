import type {
  AiFigureFromMetric,
  DisaggregationOption,
  MetricWithStatus,
  PeriodOption,
  PresentationObjectConfig,
  ResultsValueForVisualization,
} from "lib";

import { DEFAULT_S_CONFIG, DEFAULT_T_CONFIG, getMetricStaticData } from "lib";
import { validatePresetOverrides } from "~/components/project_ai/ai_tools/validators/content_validators";

type BuildConfigResult =
  | {
      success: true;
      resultsValue: MetricWithStatus;
      resultsValueForViz: ResultsValueForVisualization;
      config: PresentationObjectConfig;
    }
  | { success: false; error: string };

export function buildConfigFromPreset(
  input: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): BuildConfigResult {
  const { metricId, vizPresetId } = input;
  const resultsValue = metrics.find((m) => m.id === metricId);

  if (!resultsValue) {
    return { success: false, error: `Metric "${metricId}" not found` };
  }

  const staticData = getMetricStaticData(metricId);
  const preset = staticData.vizPresets?.find((p) => p.id === vizPresetId);

  if (!preset) {
    const available =
      staticData.vizPresets?.map((p) => p.id).join(", ") || "none";
    return {
      success: false,
      error: `Viz preset "${vizPresetId}" not found for metric "${metricId}". Available presets: ${available}`,
    };
  }

  // Validate overrides before applying
  validatePresetOverrides(
    metricId,
    input.filters,
    input.startDate,
    input.endDate,
    resultsValue,
  );

  const resultsValueForViz: ResultsValueForVisualization = {
    formatAs: resultsValue.formatAs,
    valueProps: resultsValue.valueProps,
    valueLabelReplacements: resultsValue.valueLabelReplacements,
  };

  const config: PresentationObjectConfig = {
    d: { ...preset.config.d },
    s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
    t: { ...DEFAULT_T_CONFIG, caption: input.chartTitle },
  };

  if (input.selectedReplicant) {
    config.d.selectedReplicantValue = input.selectedReplicant;
  }

  if (input.filters) {
    const allowedFilters = preset.allowedFilters;
    if (allowedFilters) {
      for (const f of input.filters) {
        if (!allowedFilters.includes(f.col as DisaggregationOption)) {
          const allowed = allowedFilters.length > 0
            ? allowedFilters.join(", ")
            : "none (this preset does not support filters)";
          throw new Error(
            `Invalid filter dimension "${f.col}" for preset "${vizPresetId}". ` +
            `Allowed filter dimensions: ${allowed}`,
          );
        }
      }
    }
    config.d.filterBy = input.filters.map((f) => ({
      disOpt: f.col as DisaggregationOption,
      values: f.vals,
    }));
  }

  if (input.valuesFilter) {
    config.d.valuesFilter = input.valuesFilter;
  }

  if (input.startDate != null && input.endDate != null) {
    const targetPeriodOption = preset.config.d.periodOpt;
    config.d.periodFilter = {
      filterType: "custom",
      periodOption: targetPeriodOption,
      min: convertPeriodValue(input.startDate, targetPeriodOption, false),
      max: convertPeriodValue(input.endDate, targetPeriodOption, true),
    };
  }

  return { success: true, resultsValue, resultsValueForViz, config };
}

export function convertPeriodValue(
  value: number,
  target: PeriodOption,
  isEnd: boolean,
): number {
  const digits = String(value).length;

  if (digits <= 4) {
    const year = value;
    if (target === "year") return year;
    if (target === "quarter_id") return year * 100 + (isEnd ? 4 : 1);
    if (target === "period_id") return year * 100 + (isEnd ? 12 : 1);
    throw new Error(`Cannot convert ${value} to ${target} format`);
  }

  const year = Math.floor(value / 100);
  const monthOrQuarter = value % 100;

  if (target === "year") return year;
  if (target === "period_id") return value;
  if (target === "quarter_id") {
    if (monthOrQuarter >= 1 && monthOrQuarter <= 12) {
      return year * 100 + Math.ceil(monthOrQuarter / 3);
    }
    throw new Error(`Cannot convert ${value} to quarter_id format — month/quarter value ${monthOrQuarter} is out of range 1-12`);
  }

  throw new Error(`Cannot convert ${value} to ${target} format`);
}
