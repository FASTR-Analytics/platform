import type {
  AiFigureFromMetric,
  DisaggregationOption,
  MetricWithStatus,
  PresentationObjectConfig,
  ResultsValueForVisualization,
} from "lib";

import { DEFAULT_S_CONFIG, DEFAULT_T_CONFIG, convertPeriodValue } from "lib";
import { validatePresetOverrides } from "~/components/project_ai/ai_tools/validators/content_validators";

type BuildConfigResult = {
  resultsValue: MetricWithStatus;
  resultsValueForViz: ResultsValueForVisualization;
  config: PresentationObjectConfig;
};

// Throws on every invalid input (the AI tool engine converts throws to
// is_error results) — no {success:false} returns.
export function buildConfigFromPreset(
  input: AiFigureFromMetric,
  metrics: MetricWithStatus[],
): BuildConfigResult {
  const { metricId, vizPresetId } = input;
  const resultsValue = metrics.find((m) => m.id === metricId);

  if (!resultsValue) {
    throw new Error(`Metric "${metricId}" not found`);
  }

  const preset = resultsValue.vizPresets?.find((p) => p.id === vizPresetId);

  if (!preset) {
    const available =
      resultsValue.vizPresets?.map((p) => p.id).join(", ") || "none";
    throw new Error(
      `Viz preset "${vizPresetId}" not found for metric "${metricId}". Available presets: ${available}`,
    );
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
        if (!allowedFilters.includes(f.disOpt)) {
          const allowed = allowedFilters.length > 0
            ? allowedFilters.join(", ")
            : "none (this preset does not support filters)";
          throw new Error(
            `Invalid filter dimension "${f.disOpt}" for preset "${vizPresetId}". ` +
            `Allowed filter dimensions: ${allowed}`,
          );
        }
      }
    }
    config.d.filterBy = input.filters;
  }

  if (input.valuesFilter) {
    config.d.valuesFilter = input.valuesFilter;
  }

  if (input.startDate != null && input.endDate != null) {
    const targetPeriodOption = resultsValue.mostGranularTimePeriodColumnInResultsFile;
    if (!targetPeriodOption) {
      // Same rule as update_viz_config — silently ignoring the requested
      // range would show all data under a success message.
      throw new Error(
        `Cannot apply startDate/endDate: metric "${metricId}" has no time period column`,
      );
    }
    config.d.periodFilter = {
      filterType: "custom",
      min: convertPeriodValue(input.startDate, targetPeriodOption, false),
      max: convertPeriodValue(input.endDate, targetPeriodOption, true),
    };
  }

  return { resultsValue, resultsValueForViz, config };
}
