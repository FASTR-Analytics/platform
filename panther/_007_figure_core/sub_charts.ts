// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getValueAxisValueRange } from "./_axes/measure_y_axis.ts";
import { getXValueAxisValueRange } from "./_axes/measure_x_axis.ts";
import { computeSlotExtent } from "./_axes/slot_layout.ts";
import type { SubChartContent } from "./_content/content_generation_types.ts";
import { measureDataLabelEndClearance } from "./_content/measure_data_label_clearance.ts";
import { valueAxisExtentOfRect } from "./_content/orientation_helpers.ts";
import { resolveSubChartContent } from "./_content/resolve_sub_chart_content.ts";
import type { RenderContext } from "./deps.ts";
import { getDimensionMembers, RectCoordsDims } from "./deps.ts";
import type { ChartItemDataDimensions } from "./chart_items.ts";
import type {
  MeasuredAxes,
  MeasurePaneConfig,
  PaneTierOrLaneLayout,
} from "./measure_types.ts";
import {
  clampOverhangClearance,
  type OverhangClearance,
  type ValueRange,
} from "./types.ts";

export type SubChart =
  | {
    kind: "category-and-value";
    i_pane: number;
    i_tier: number;
    i_lane: number;
    tierOrdinal: number;
    laneOrdinal: number;
    rcd: RectCoordsDims;
    nValues: number;
    nSlots: number;
    slotOrder: number[];
    positionOrdinals: (number | undefined)[];
    slotExtent: number;
    isCentered: boolean;
    valueRange: ValueRange;
    valueClearance: OverhangClearance;
    content: SubChartContent;
  }
  | {
    kind: "none";
    i_pane: number;
    i_tier: number;
    i_lane: number;
    tierOrdinal: number;
    laneOrdinal: number;
    rcd: RectCoordsDims;
  };

type ChartValueTensors = {
  values: (number | undefined)[][][][][];
  uncertaintyValues?: {
    ub: (number | undefined)[][][][][];
    lb: (number | undefined)[][][][][];
  };
};

export function chartValueTensors<TData>(
  config: MeasurePaneConfig<TData>,
): ChartValueTensors {
  return config.chart.transformedData as TData & ChartValueTensors;
}

function buildPositionOrdinals(
  slotOrder: number[],
  nValues: number,
): (number | undefined)[] {
  const ordinals: (number | undefined)[] = Array.from(
    { length: nValues },
    () => undefined,
  );
  slotOrder.forEach((i_value, ordinal) => {
    ordinals[i_value] = ordinal;
  });
  return ordinals;
}

export function buildSubCharts<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  measured: {
    axes: MeasuredAxes;
    yAxisRcd: RectCoordsDims;
    uniformSubChartHeight: number;
    uniformSubChartWidth: number;
    tierHeaderAndLabelGapHeight: number;
    tierOrLaneLayout?: PaneTierOrLaneLayout;
  },
  itemDataDimensions: ChartItemDataDimensions,
): SubChart[] {
  const i_pane = config.i_pane;
  const { mergedStyle, dataDimensions, masks } = config.chart;
  const { axes, tierOrLaneLayout } = measured;
  const tierLayout = tierOrLaneLayout?.tierOrLaneDimension === "tier"
    ? tierOrLaneLayout
    : undefined;
  const laneLayout = tierOrLaneLayout?.tierOrLaneDimension === "lane"
    ? tierOrLaneLayout
    : undefined;
  const tierMembers = getDimensionMembers(dataDimensions.tier);
  const laneMembers = getDimensionMembers(dataDimensions.lane);
  const tierIndices = tierLayout?.tierOrLaneIndices ??
    masks?.visibleTiersByPane?.[i_pane] ?? tierMembers.map((_, i) => i);
  const laneIndices = laneLayout?.tierOrLaneIndices ??
    masks?.visibleLanesByPane?.[i_pane] ?? laneMembers.map((_, i) => i);

  const geometry: Extract<SubChart, { kind: "none" }>[] = [];
  let y = measured.yAxisRcd.y() + mergedStyle.tiers.paddingTop +
    measured.tierHeaderAndLabelGapHeight;
  tierIndices.forEach((i_tier, tierOrdinal) => {
    const h = tierLayout?.tierOrLaneExtents[tierOrdinal] ??
      measured.uniformSubChartHeight;
    let x = measured.yAxisRcd.rightX() + mergedStyle.lanes.paddingLeft;
    laneIndices.forEach((i_lane, laneOrdinal) => {
      const w = laneLayout?.tierOrLaneExtents[laneOrdinal] ??
        measured.uniformSubChartWidth;
      geometry.push({
        kind: "none",
        i_pane,
        i_tier,
        i_lane,
        tierOrdinal,
        laneOrdinal,
        rcd: new RectCoordsDims({ x, y, w, h }),
      });
      x += w + mergedStyle.lanes.gapX;
    });
    y += h + mergedStyle.tiers.gapY + measured.tierHeaderAndLabelGapHeight;
  });

  if (axes.kind === "none") {
    return geometry;
  }

  const gsw = mergedStyle.grid.gridLineStrokeWidth;
  const nValues = axes.orientation === "horizontal"
    ? axes.y.info.nIndicators
    : axes.x.type === "text"
    ? axes.x.config.indicatorMembers.length
    : axes.x.config.nTimePoints;
  const isCentered = axes.orientation === "horizontal"
    ? axes.y.config.axisStyle.tickPosition === "center"
    : axes.x.type === "text"
    ? axes.x.config.axisStyle.tickPosition === "center"
    : axes.x.info.periodAxisType === "year-centered";
  const visibleIndicators = masks?.visibleIndicatorsByPane?.[i_pane];
  const clearanceGroupOf = (subChart: { i_tier: number; i_lane: number }) =>
    axes.orientation === "horizontal" ? subChart.i_lane : subChart.i_tier;

  const overhang = axes.orientation === "horizontal"
    ? axes.x.config.axisStyle.tickLabelAlignment === "inset"
      ? 0
      : Math.max(0, (axes.x.info.xValueAxisHeightInfo.maxTickLabelW - gsw) / 2)
    : axes.y.config.axisStyle.tickLabelAlignment === "inset"
    ? 0
    : Math.max(0, axes.y.info.halfYAxisTickLabelH - gsw / 2);
  const maxClearanceFractionOfExtent = axes.orientation === "horizontal"
    ? axes.x.config.axisStyle.maxOverhangClearanceFractionOfExtent
    : axes.y.config.axisStyle.maxOverhangClearanceFractionOfExtent;
  const startClearanceOf = (i_tier: number, i_lane: number) =>
    axes.orientation === "horizontal"
      ? i_lane === 0
        ? Math.max(0, overhang - axes.y.info.widthIncludingYAxisStrokeWidth)
        : overhang
      : i_tier === tierMembers.length - 1
      ? Math.max(0, overhang - axes.x.info.xAxisRcd.h())
      : overhang;

  const tensors = chartValueTensors(config);
  const unclamped = geometry.map(
    (g): Extract<SubChart, { kind: "category-and-value" }> => {
      const slotOrder = tierLayout?.visibleIndicators[g.tierOrdinal] ??
        laneLayout?.visibleIndicators[g.laneOrdinal] ??
        visibleIndicators ??
        Array.from({ length: nValues }, (_, i) => i);
      const subChart: Omit<
        Extract<SubChart, { kind: "category-and-value" }>,
        "content"
      > = {
        ...g,
        kind: "category-and-value",
        nValues,
        nSlots: slotOrder.length,
        slotOrder,
        positionOrdinals: buildPositionOrdinals(slotOrder, nValues),
        slotExtent: axes.orientation === "horizontal"
          ? computeSlotExtent(g.rcd.h(), slotOrder.length, isCentered, gsw)
          : axes.x.info.slotExtent,
        isCentered,
        valueRange: axes.orientation === "horizontal"
          ? getXValueAxisValueRange(axes.x, g.i_lane)
          : getValueAxisValueRange(axes.y, g.i_tier),
        valueClearance: {
          start: startClearanceOf(g.i_tier, g.i_lane),
          end: overhang,
        },
      };
      return {
        ...subChart,
        content: resolveSubChartContent(rc, subChart, {
          seriesValues: tensors.values[i_pane][g.i_tier][g.i_lane],
          uncertaintyUbSeriesValues: tensors.uncertaintyValues
            ?.ub[i_pane][g.i_tier][g.i_lane],
          uncertaintyLbSeriesValues: tensors.uncertaintyValues
            ?.lb[i_pane][g.i_tier][g.i_lane],
          orientation: axes.orientation,
          itemDataDimensions,
          contentStyle: mergedStyle.content,
          dataLabelsTextStyle: mergedStyle.text.dataLabels,
        }),
      };
    },
  );

  const endClearances = new Map<number, number>();
  for (const subChart of unclamped) {
    const group = clearanceGroupOf(subChart);
    endClearances.set(
      group,
      Math.max(
        endClearances.get(group) ?? subChart.valueClearance.end,
        measureDataLabelEndClearance(subChart, axes.orientation),
      ),
    );
  }
  return unclamped.map((subChart) => ({
    ...subChart,
    valueClearance: clampOverhangClearance(
      {
        start: subChart.valueClearance.start,
        end: endClearances.get(clearanceGroupOf(subChart)) ??
          subChart.valueClearance.end,
      },
      valueAxisExtentOfRect(subChart.rcd, axes.orientation),
      maxClearanceFractionOfExtent,
    ),
  }));
}
