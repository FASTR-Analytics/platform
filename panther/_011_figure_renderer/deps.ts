// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export { RectCoordsDims } from "../_001_geometry/mod.ts";
export type {
  RenderContext,
  Renderer,
  ShapeRectPrimitive,
  SizeConstraints,
} from "../_001_render_system/mod.ts";
export {
  generateAnnotationPrimitives,
  resolveFigureAutofitOptions,
} from "../_007_figure_core/mod.ts";
export type { DataConfigIssue } from "../_007_figure_core/mod.ts";
export {
  ChartOHRenderer,
  getChartOHDataConfigIssues,
  isChartOHDataJson,
} from "../_010_chartoh/mod.ts";
export type { ChartOHInputs, MeasuredChartOH } from "../_010_chartoh/mod.ts";
export {
  ChartOVRenderer,
  getChartOVDataConfigIssues,
  isChartOVDataJson,
} from "../_010_chartov/mod.ts";
export type { ChartOVInputs, MeasuredChartOV } from "../_010_chartov/mod.ts";
export { getMapDataConfigIssues, MapRenderer } from "../_010_maps/mod.ts";
export type { MapInputs, MeasuredMap } from "../_010_maps/mod.ts";
export {
  getPieDataConfigIssues,
  isPieDataTransformed,
  PieRenderer,
} from "../_010_pie/mod.ts";
export type { MeasuredPie, PieInputs } from "../_010_pie/mod.ts";
export {
  getScatterDataConfigIssues,
  isScatterDataTransformed,
  ScatterRenderer,
} from "../_010_scatter/mod.ts";
export type { MeasuredScatter, ScatterInputs } from "../_010_scatter/mod.ts";
export { DiagramRenderer, SceneRenderer } from "../_010_scene/mod.ts";
export type {
  CustomDraw,
  DiagramInputs,
  MeasuredDiagram,
  MeasuredScene,
  SceneInputs,
} from "../_010_scene/mod.ts";
export {
  getTableDataConfigIssues,
  isTableDataJson,
  TableRenderer,
} from "../_010_table/mod.ts";
export type { MeasuredTable, TableInputs } from "../_010_table/mod.ts";
export {
  getTimeseriesDataConfigIssues,
  isTimeseriesDataJson,
  TimeseriesRenderer,
} from "../_010_timeseries/mod.ts";
export type {
  MeasuredTimeseries,
  TimeseriesInputs,
} from "../_010_timeseries/mod.ts";
