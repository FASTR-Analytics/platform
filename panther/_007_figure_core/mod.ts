// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export * from "./_axes/x_period/types.ts";
export * from "./_axes/x_value/types.ts";
export * from "./_axes/x_text/types.ts";
export * from "./_axes/y_text/types.ts";
export {
  buildSecondValueAxisConfig,
  getValueAxisOfSeries,
  referenceLinesOn,
  type ValueAxisOfSeries,
} from "./_axes/axis_configs.ts";
export { measureXValueAxisHeight } from "./_axes/x_value/measure.ts";
export {
  estimateMinYValueAxesWidth,
  estimateMinYValueAxisWidth,
} from "./_axes/y_value/measure.ts";
export { estimateMinYTextAxisWidth } from "./_axes/y_text/measure.ts";
export { computeTotalGridLineStrokeWidth } from "./_axes/slot_layout.ts";
export { estimateTierHeaderAndLabelGapWidth } from "./measure_pane.ts";
export { buildDataLabelTextStyle } from "./_content/content_generation_types.ts";
export * from "./_content/sample_series_infos.ts";
export * from "./_labels/mod.ts";
export { generateScaleLegendPrimitive } from "./_legend/generate_scale_legend_primitive.ts";
export * from "./_legend/legend_series.ts";
export * from "./_legend/measure_legend.ts";
export * from "./_legend/measure_scale_legend.ts";
export { resolveAutoScaleLegend } from "./_legend/resolve_auto_scale_legend.ts";
export * from "./_legend/scale_legend_types.ts";
export * from "./_legend/types.ts";
export * from "./_legend/utils.ts";
export * from "./_surrounds/generate_surrounds_primitives.ts";
export * from "./_surrounds/measure_surrounds.ts";
export * from "./autofit.ts";
export * from "./chart_size_helpers.ts";
export * from "./common_data_transform.ts";
export * from "./data_config_issues.ts";
export * from "./dimension_helpers.ts";
export * from "./measure_chart.ts";
export * from "./measure_types.ts";
export * from "./chart_ov_or_oh_data_config_issues.ts";
export * from "./chart_ov_or_oh_transform.ts";
export * from "./generate_annotation_primitives.ts";
export * from "./render_primitives.ts";
export * from "./sub_chart_members.ts";
export * from "./types.ts";
