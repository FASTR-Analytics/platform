import type { PresentationObjectConfig } from "lib";

// Metrics that support each special chart mode
export const SPECIAL_COVERAGE_CHART_METRICS = [
  "m4-01-01",
  "m6-01-01",
  "m6-02-01",
  "m6-03-01",
];

export const SPECIAL_PERCENT_CHANGE_CHART_METRICS = ["m3-01-01"];

export const SPECIAL_DISRUPTIONS_CHART_METRICS = [
  "m3-02-01",
  "m3-03-01",
  "m3-04-01",
  "m3-05-01",
];

export const SPECIAL_SCORECARD_TABLE_METRICS = ["m8-01-01"];

// Metrics whose displayed values are DERIVED measures (not the indicator's own
// quantity), so the metric's own formatAs must win over the displayed-indicators'
// format. Without this, e.g. m9-02-01's CIX/SII numbers computed over percent
// coverage indicators get wrongly rendered as percent (50 -> "5000%").
export const ALWAYS_OBEY_METRIC_FORMAT_METRICS = ["m9-02-01"];

export function metricAlwaysObeysFormatAs(metricId: string): boolean {
  return ALWAYS_OBEY_METRIC_FORMAT_METRICS.includes(metricId);
}

// Metrics whose displayed values can be NEGATIVE. Their value axis resolves its
// minimum with "auto-zero" (fit below 0 when the data goes there, otherwise
// anchor at 0) instead of flooring at 0 — which draws negative values outside
// the plot box, over the x-axis tick labels. Two groups:
//
//   signed by construction — a difference or a change, negative whenever the
//   thing declined: m9-02-01 (CIX / SII for pro-poor indicators),
//   m2-01-01..03 (percent change from outlier/completeness adjustment),
//   m3-0x-02 (actual-vs-expected difference, %).
//
//   signed only via a negative model prediction — volumes, which cannot really
//   go below 0, but M3's expected-volume model can predict one and that is the
//   originally-observed defect: m3-0x-01 ("Disruptions and surpluses") and
//   m3-0x-03 ("Actual vs expected service volume"), both of which plot the
//   expected series.
//
// "auto-zero" is a no-op on data that never crosses zero, so listing a metric
// here cannot change how its existing non-negative charts render.
export const ALLOW_NEGATIVE_SCALE_VALUES_METRICS = [
  "m9-02-01",
  "m2-01-01",
  "m2-01-02",
  "m2-01-03",
  "m3-02-01",
  "m3-02-02",
  "m3-02-03",
  "m3-03-01",
  "m3-03-02",
  "m3-03-03",
  "m3-04-01",
  "m3-04-02",
  "m3-04-03",
  "m3-05-01",
  "m3-05-02",
  "m3-05-03",
];

export function metricAllowsNegativeScale(metricId: string): boolean {
  return ALLOW_NEGATIVE_SCALE_VALUES_METRICS.includes(metricId);
}

// "Can this metric use X mode?" — controls whether toggle is shown in editor
export function canUseSpecialCoverageChart(metricId: string): boolean {
  return SPECIAL_COVERAGE_CHART_METRICS.includes(metricId);
}

export function canUseSpecialPercentChangeChart(metricId: string): boolean {
  return SPECIAL_PERCENT_CHANGE_CHART_METRICS.includes(metricId);
}

export function canUseSpecialDisruptionsChart(metricId: string): boolean {
  return SPECIAL_DISRUPTIONS_CHART_METRICS.includes(metricId);
}

export function canUseSpecialScorecardTable(metricId: string): boolean {
  return SPECIAL_SCORECARD_TABLE_METRICS.includes(metricId);
}

// "Is X mode currently active?" — controls rendering behavior
export function isSpecialScorecardTableActive(config: PresentationObjectConfig): boolean {
  return config.s.specialScorecardTable === true && config.d.type === "table";
}

export function isSpecialBarChartActive(config: PresentationObjectConfig): boolean {
  return config.s.specialBarChart === true && config.d.type === "timeseries";
}

export function isSpecialCoverageChartActive(config: PresentationObjectConfig): boolean {
  return config.s.specialCoverageChart === true && config.d.type === "timeseries";
}

export function isSpecialDisruptionsChartActive(config: PresentationObjectConfig): boolean {
  return config.s.specialDisruptionsChart === true && config.d.type === "timeseries";
}