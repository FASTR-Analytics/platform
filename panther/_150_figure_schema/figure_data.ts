// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { z } from "./deps.ts";
import type {
  ChartOHData,
  ChartOVData,
  MapData,
  SimpleVizData,
  TableData,
  TimeseriesData,
} from "./deps.ts";
import { zAnyPresentObject } from "./shared.ts";
import { zChartOHData } from "./chartoh.ts";
import { zChartOVData } from "./chartov.ts";
import { zTableData } from "./table.ts";
import { zTimeseriesData } from "./timeseries.ts";

export type FigureData =
  | { tableData: TableData }
  | { chartData: ChartOVData }
  | { chartOHData: ChartOHData }
  | { timeseriesData: TimeseriesData }
  | { simpleVizData: SimpleVizData }
  | { mapData: MapData };

// One member per FigureInputs data field (same discriminator set as
// FigureRenderer.isType). Timeseries / ChartOV / ChartOH / Table are validated
// in depth; simpleVizData and mapData are recognized but deliberately
// unvalidated (no production drift history, and mapData.geoData is stripped
// before storage), so their blobs never false-fail a migration gate.
export const zFigureData: z.ZodType<FigureData> = z.union([
  z.object({ tableData: zTableData }),
  z.object({ chartData: zChartOVData }),
  z.object({ chartOHData: zChartOHData }),
  z.object({ timeseriesData: zTimeseriesData }),
  z.object({ simpleVizData: zAnyPresentObject<SimpleVizData>() }),
  z.object({ mapData: zAnyPresentObject<MapData>() }),
]);

export function isValidFigureData(x: unknown): boolean {
  return zFigureData.safeParse(x).success;
}
