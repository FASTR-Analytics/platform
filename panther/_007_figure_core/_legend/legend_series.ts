// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { MergedContentStyle } from "../deps.ts";
import { getValueAxisOfSeries } from "../_axes/axis_configs.ts";
import {
  sampleScatterPointInfos,
  sampleSeriesInfos,
  type ScatterSampleData,
  type SeriesSample,
  type SeriesSampleData,
} from "../_content/sample_series_infos.ts";
import type { LegendSeries, LegendSwatch } from "./types.ts";

export function buildCategoryAndValueLegendSeries(
  content: MergedContentStyle,
  data: SeriesSampleData,
): LegendSeries {
  return {
    dimension: data.series,
    valueAxisOfSeries: getValueAxisOfSeries(
      data.series,
      data.secondValueAxis?.seriesMemberIds,
    ),
    swatches: sampleSeriesInfos(data).map((sample) =>
      swatchOfMarks(content, sample)
    ),
  };
}

export function buildScatterLegendSeries(
  content: MergedContentStyle,
  data: ScatterSampleData,
): LegendSeries {
  return {
    dimension: data.series,
    swatches: sampleScatterPointInfos(data).map((info): LegendSwatch => {
      const point = info && content.scatterPoints.getStyle(info);
      return { pointStyle: point?.show ? point.pointStyle : "as-block" };
    }),
  };
}

// A bar's block first, since a series' bars are its largest mark, then a line
// before points, since points on a line mark its values.
function swatchOfMarks(
  content: MergedContentStyle,
  sample: SeriesSample,
): LegendSwatch {
  if (content.bars.getStyle(sample.firstValue).show) {
    return { pointStyle: "as-block" };
  }
  const line = content.lines.getStyle(sample.series);
  if (line.show) {
    return { pointStyle: "as-line", lineDash: line.lineDash };
  }
  const point = content.points.getStyle(sample.firstValue);
  return { pointStyle: point.show ? point.pointStyle : "as-block" };
}
