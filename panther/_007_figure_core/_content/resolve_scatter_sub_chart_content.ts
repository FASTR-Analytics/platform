// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MergedContentStyle,
  RenderContext,
  ScatterPointInfo,
  TextInfoUnkeyed,
} from "../deps.ts";
import { Coordinates, getDimensionMembers } from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import type { ValueRange } from "../types.ts";
import {
  buildDataLabelTextStyle,
  dataLabelBox,
  type ResolvedScatterLabel,
  type ResolvedScatterPoint,
  type ScatterSubChartContent,
  type ValueAxisReach,
} from "./content_generation_types.ts";
import { pointLabelPlace } from "./generate_point_primitives.ts";

// Each drawn point, a point both of whose values are defined, in draw order:
// each indicator member in turn and within it each series, so a point is
// drawn over the points of earlier members.
export function resolveScatterSubChartContent(
  rc: RenderContext,
  subChart: {
    i_pane: number;
    i_tier: number;
    i_lane: number;
    xValueRange: ValueRange;
    yValueRange: ValueRange;
  },
  p: {
    xValues: (number | undefined)[][];
    yValues: (number | undefined)[][];
    itemDataDimensions: ChartItemDataDimensions;
    contentStyle: MergedContentStyle;
    dataLabelsTextStyle: TextInfoUnkeyed;
  },
): ScatterSubChartContent {
  const dims = p.itemDataDimensions;
  const s = p.contentStyle.scatterPoints;
  const paneMembers = getDimensionMembers(dims.pane);
  const tierMembers = getDimensionMembers(dims.tier);
  const laneMembers = getDimensionMembers(dims.lane);
  const nSerieses = getDimensionMembers(dims.series).length;
  const nIndicators = getDimensionMembers(dims.indicator).length;

  const resolvedScatterPoints: ResolvedScatterPoint[] = [];
  for (let i_indicator = 0; i_indicator < nIndicators; i_indicator++) {
    for (let i_series = 0; i_series < nSerieses; i_series++) {
      const xValue = p.xValues[i_series]?.[i_indicator];
      const yValue = p.yValues[i_series]?.[i_indicator];
      if (xValue === undefined || yValue === undefined) {
        continue;
      }
      const info: ScatterPointInfo = {
        i_series,
        isFirstSeries: i_series === 0,
        isLastSeries: i_series === nSerieses - 1,
        seriesMember: dims.series?.members[i_series],
        valueAxis: undefined,
        nSerieses,
        seriesValueArrays: [],
        nValues: nIndicators,
        i_pane: subChart.i_pane,
        nPanes: paneMembers.length,
        paneMember: paneMembers[subChart.i_pane],
        i_tier: subChart.i_tier,
        nTiers: tierMembers.length,
        tierMember: tierMembers[subChart.i_tier],
        i_lane: subChart.i_lane,
        nLanes: laneMembers.length,
        laneMember: laneMembers[subChart.i_lane],
        xValue,
        yValue,
        xValueMin: subChart.xValueRange.valueMin,
        xValueMax: subChart.xValueRange.valueMax,
        yValueMin: subChart.yValueRange.valueMin,
        yValueMax: subChart.yValueRange.valueMax,
        seriesXValueArrays: p.xValues,
        seriesYValueArrays: p.yValues,
        i_indicator,
        nIndicators,
        indicatorMember: dims.indicator?.members[i_indicator],
      };
      const style = s.getStyle(info);
      const label = style.show && style.dataLabel.show
        ? resolveScatterLabel(
          rc,
          style,
          s.textFormatter !== "none"
            ? s.textFormatter(info)
            : (dims.indicator !== undefined
              ? info.indicatorMember?.label
              : info.seriesMember?.label) ?? "",
          p.dataLabelsTextStyle,
        )
        : undefined;
      const reach = scatterPointReach(style.radius, label);
      resolvedScatterPoints.push({ info, style, label, ...reach });
    }
  }
  return { resolvedScatterPoints };
}

function resolveScatterLabel(
  rc: RenderContext,
  style: ResolvedScatterPoint["style"],
  text: string,
  dataLabelsTextStyle: TextInfoUnkeyed,
): ResolvedScatterLabel | undefined {
  const dl = style.dataLabel;
  const halo = buildLabelHalo(dl);
  if (!text.trim() && halo === undefined) {
    return undefined;
  }
  return {
    mText: rc.mText(
      text,
      buildDataLabelTextStyle(dataLabelsTextStyle, dl),
      Number.POSITIVE_INFINITY,
    ),
    halo,
    side: style.dataLabelPosition,
    offset: style.radius + dl.offset,
    leaderLine: dl.leaderLine,
  };
}

// The y axis's start side is down.
function scatterPointReach(
  radius: number,
  label: ResolvedScatterLabel | undefined,
): { xReach: ValueAxisReach; yReach: ValueAxisReach } {
  if (label === undefined) {
    const radiusReach = { startExtent: radius, endExtent: radius };
    return { xReach: radiusReach, yReach: radiusReach };
  }
  const box = dataLabelBox(
    label,
    pointLabelPlace(new Coordinates([0, 0]), label.side, label.offset),
  );
  return {
    xReach: {
      startExtent: Math.max(radius, -box.x()),
      endExtent: Math.max(radius, box.rightX()),
    },
    yReach: {
      startExtent: Math.max(radius, box.bottomY()),
      endExtent: Math.max(radius, -box.y()),
    },
  };
}
