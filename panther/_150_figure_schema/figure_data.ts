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
  VizGraphData,
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
  | { vizGraphData: VizGraphData }
  | { mapData: MapData };

// One member per FigureInputs data field (same discriminator set as
// FigureRenderer.isType). Timeseries / ChartOV / ChartOH / Table are validated
// in depth; simpleVizData, mapData, and vizGraphData are recognized but
// deliberately unvalidated — simpleviz/map have no production drift history
// (and mapData.geoData is stripped before storage); vizgraph has no consumer
// storing blobs at all (checked wb-fastr/marker/panrunner, 2026-07-13 — no
// app-level references), so there is no migration gate to protect. Deep
// zVizGraphData is warranted only when a consumer persists vizgraph figures.
export const zFigureData: z.ZodType<FigureData> = z.union([
  z.object({ tableData: zTableData }),
  z.object({ chartData: zChartOVData }),
  z.object({ chartOHData: zChartOHData }),
  z.object({ timeseriesData: zTimeseriesData }),
  z.object({ simpleVizData: zAnyPresentObject<SimpleVizData>() }),
  z.object({ vizGraphData: zAnyPresentObject<VizGraphData>() }),
  z.object({ mapData: zAnyPresentObject<MapData>() }),
]);

export function isValidFigureData(x: unknown): boolean {
  return zFigureData.safeParse(x).success;
}
