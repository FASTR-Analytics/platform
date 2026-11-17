// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export {
  zChartValueAxisLimits,
  zChartValueAxisLimitsEntry,
  zChartValueAxisPaneLimits,
  zDataDimension,
  zDimensionMember,
  zDimensionMembers,
  zJsonArray,
  zJsonArrayItem,
  zMemberSortConfig,
  zPeriodType,
  zUncertaintyConfig,
} from "./shared.ts";
export type { Conforms, ConformsExactly } from "./shared.ts";
export {
  zTimeseriesData,
  zTimeseriesDataJson,
  zTimeseriesDataTransformed,
  zTimeseriesJsonDataConfig,
} from "./timeseries.ts";
export {
  zChartOVData,
  zChartOVDataJson,
  zChartOVDataTransformed,
  zChartOVJsonDataConfig,
} from "./chartov.ts";
export {
  zChartOHData,
  zChartOHDataJson,
  zChartOHDataTransformed,
  zChartOHJsonDataConfig,
} from "./chartoh.ts";
export {
  zPieData,
  zPieDataJson,
  zPieDataTransformed,
  zPieJsonDataConfig,
} from "./pie.ts";
export {
  zTableData,
  zTableDataJson,
  zTableDataTransformed,
  zTableJsonDataConfig,
} from "./table.ts";
export {
  isValidFigureInputs,
  zChartOHInputs,
  zChartOVInputs,
  zDiagramInputs,
  zFigureInputs,
  zLegendInput,
  zMapInputs,
  zPieInputs,
  zSceneInputs,
  zTableInputs,
  zTimeseriesInputs,
} from "./figure_inputs.ts";
