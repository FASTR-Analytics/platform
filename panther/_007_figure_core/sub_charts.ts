// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getValueAxisValueRange } from "./_axes/measure_y_axis.ts";
import { getXValueAxisValueRange } from "./_axes/measure_x_axis.ts";
import { computeSlotExtent } from "./_axes/slot_layout.ts";
import type {
  ScatterSubChartContent,
  SubChartContent,
} from "./_content/content_generation_types.ts";
import { measureDataLabelEndClearance } from "./_content/measure_data_label_clearance.ts";
import {
  measureScatterValueClearance,
  type ScatterValueAxisReach,
} from "./_content/measure_scatter_value_clearance.ts";
import { valueAxisExtentOfRect } from "./_content/orientation_helpers.ts";
import { resolveScatterSubChartContent } from "./_content/resolve_scatter_sub_chart_content.ts";
import { resolveSubChartContent } from "./_content/resolve_sub_chart_content.ts";
import {
  getSecondValueAxisSeriesMemberIds,
  getValueAxisOfSeries,
} from "./_axes/axis_configs.ts";
import type { ChartValueAxis, RenderContext } from "./deps.ts";
import {
  assertNotUndefined,
  getDimensionMembers,
  RectCoordsDims,
} from "./deps.ts";
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
    secondValueRange: ValueRange | undefined;
    seriesValueAxes: ChartValueAxis[];
    valueClearance: OverhangClearance;
    content: SubChartContent;
  }
  | {
    kind: "value-and-value";
    i_pane: number;
    i_tier: number;
    i_lane: number;
    tierOrdinal: number;
    laneOrdinal: number;
    rcd: RectCoordsDims;
    xValueRange: ValueRange;
    yValueRange: ValueRange;
    xValueClearance: OverhangClearance;
    yValueClearance: OverhangClearance;
    content: ScatterSubChartContent;
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
  if (axes.kind === "value-and-value") {
    return buildValueAndValueSubCharts(
      rc,
      config,
      axes,
      geometry,
      itemDataDimensions,
    );
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

  const valueAxisOfSeries = getValueAxisOfSeries(
    dataDimensions.series,
    getSecondValueAxisSeriesMemberIds(config.chart.axes),
  );
  const seriesValueAxes = getDimensionMembers(dataDimensions.series).map(
    (_, i_series) => valueAxisOfSeries(i_series),
  );

  // Both value axes map into one inset extent, so their first and last ticks
  // stand together: on x value axes, whose labels differ in width by their
  // formatters, the clearance takes the wider of their overhangs. Two y value
  // axes' labels share one text style, so they overhang alike.
  const overhang = axes.orientation === "horizontal"
    ? tickLabelOverhang(
      axes.x.config.axisStyle.tickLabelAlignment,
      Math.max(
        axes.x.info.xValueAxisHeightInfo.maxTickLabelW,
        axes.secondX?.info.xValueAxisHeightInfo.maxTickLabelW ?? 0,
      ) / 2,
      gsw,
    )
    : tickLabelOverhang(
      axes.y.config.axisStyle.tickLabelAlignment,
      axes.y.info.halfYAxisTickLabelH,
      gsw,
    );
  const maxClearanceFractionOfExtent = axes.orientation === "horizontal"
    ? axes.x.config.axisStyle.maxOverhangClearanceFractionOfExtent
    : axes.y.config.axisStyle.maxOverhangClearanceFractionOfExtent;
  const startClearanceOf = (i_tier: number, i_lane: number) =>
    axes.orientation === "horizontal"
      ? i_lane === 0
        ? absorbedStart(overhang, axes.y.info.widthIncludingYAxisStrokeWidth)
        : overhang
      : i_tier === tierMembers.length - 1
      ? absorbedStart(overhang, axes.x.info.xAxisRcd.h())
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
        secondValueRange: axes.orientation === "horizontal"
          ? axes.secondX && getXValueAxisValueRange(axes.secondX, g.i_lane)
          : axes.secondY && getValueAxisValueRange(axes.secondY, g.i_tier),
        seriesValueAxes,
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

type ScatterSubChart = Extract<SubChart, { kind: "value-and-value" }>;

// The x value axis is drawn once per lane and the y once per tier, so every
// sub-chart of a lane shares its x clearance and every one of a tier its y.
// Each starts from its axis's tick label overhang, the start side absorbed by
// the adjacent axis at lane 0 and at the last tier, and rises as far as the
// lane's or tier's points reach.
function buildValueAndValueSubCharts<TData>(
  rc: RenderContext,
  config: MeasurePaneConfig<TData>,
  axes: Extract<MeasuredAxes, { kind: "value-and-value" }>,
  geometry: Extract<SubChart, { kind: "none" }>[],
  itemDataDimensions: ChartItemDataDimensions,
): ScatterSubChart[] {
  const i_pane = config.i_pane;
  const { mergedStyle, dataDimensions } = config.chart;
  const gsw = mergedStyle.grid.gridLineStrokeWidth;
  const tensors = scatterValueTensors(config);
  const lastTier = getDimensionMembers(dataDimensions.tier).length - 1;
  const xStyle = axes.x.config.axisStyle;
  const yStyle = axes.y.config.axisStyle;
  const xOverhang = tickLabelOverhang(
    xStyle.tickLabelAlignment,
    axes.x.info.xValueAxisHeightInfo.maxTickLabelW / 2,
    gsw,
  );
  const yOverhang = tickLabelOverhang(
    yStyle.tickLabelAlignment,
    axes.y.info.halfYAxisTickLabelH,
    gsw,
  );

  const resolved = geometry.map((g) => {
    const xValueRange = getXValueAxisValueRange(axes.x, g.i_lane);
    const yValueRange = getValueAxisValueRange(axes.y, g.i_tier);
    return {
      ...g,
      xValueRange,
      yValueRange,
      content: resolveScatterSubChartContent(
        rc,
        { ...g, xValueRange, yValueRange },
        {
          xValues: tensors.xValues[i_pane][g.i_tier][g.i_lane],
          yValues: tensors.yValues[i_pane][g.i_tier][g.i_lane],
          itemDataDimensions,
          contentStyle: mergedStyle.content,
          dataLabelsTextStyle: mergedStyle.text.dataLabels,
        },
      ),
    };
  });

  const xClearances = sharedClearances(
    resolved,
    (subChart) => subChart.i_lane,
    (i_lane, inLane) => {
      const extent = inLane[0].rcd.w();
      return clampOverhangClearance(
        measureScatterValueClearance(
          extent,
          {
            start: i_lane === 0
              ? absorbedStart(
                xOverhang,
                axes.y.info.widthIncludingYAxisStrokeWidth,
              )
              : xOverhang,
            end: xOverhang,
          },
          inLane.flatMap((subChart) => scatterReaches(subChart, "x")),
        ),
        extent,
        xStyle.maxOverhangClearanceFractionOfExtent,
      );
    },
  );
  const yClearances = sharedClearances(
    resolved,
    (subChart) => subChart.i_tier,
    (i_tier, inTier) => {
      const extent = inTier[0].rcd.h();
      return clampOverhangClearance(
        measureScatterValueClearance(
          extent,
          {
            start: i_tier === lastTier
              ? absorbedStart(yOverhang, axes.x.info.xAxisRcd.h())
              : yOverhang,
            end: yOverhang,
          },
          inTier.flatMap((subChart) => scatterReaches(subChart, "y")),
        ),
        extent,
        yStyle.maxOverhangClearanceFractionOfExtent,
      );
    },
  );

  return resolved.map((subChart): ScatterSubChart => ({
    ...subChart,
    kind: "value-and-value",
    xValueClearance: xClearances(subChart),
    yValueClearance: yClearances(subChart),
  }));
}

function sharedClearances<T>(
  subCharts: T[],
  groupOf: (subChart: T) => number,
  solve: (group: number, inGroup: T[]) => OverhangClearance,
): (subChart: T) => OverhangClearance {
  const solved = new Map(
    [...Map.groupBy(subCharts, groupOf)].map((
      [group, inGroup],
    ) => [group, solve(group, inGroup)]),
  );
  return (subChart) => {
    const clearance = solved.get(groupOf(subChart));
    assertNotUndefined(clearance, "A sub-chart's group has no clearance");
    return clearance;
  };
}

function scatterReaches(
  subChart: Pick<ScatterSubChart, "xValueRange" | "yValueRange" | "content">,
  axis: "x" | "y",
): ScatterValueAxisReach[] {
  const { valueMin, valueMax } = axis === "x"
    ? subChart.xValueRange
    : subChart.yValueRange;
  const range = valueMax - valueMin;
  if (range <= 0) {
    return [];
  }
  return subChart.content.resolvedScatterPoints.flatMap((point) =>
    point.style.show
      ? [{
        fraction: ((axis === "x" ? point.info.xValue : point.info.yValue) -
          valueMin) / range,
        ...(axis === "x" ? point.xReach : point.yReach),
      }]
      : []
  );
}

type ScatterValueTensors = {
  xValues: (number | undefined)[][][][][];
  yValues: (number | undefined)[][][][][];
};

function isScatterValueTensors(data: unknown): data is ScatterValueTensors {
  return typeof data === "object" && data !== null && "xValues" in data &&
    "yValues" in data;
}

function scatterValueTensors<TData>(
  config: MeasurePaneConfig<TData>,
): ScatterValueTensors {
  const data = config.chart.transformedData;
  if (!isScatterValueTensors(data)) {
    throw new Error(
      "A value-and-value chart's transformed data holds no xValues and yValues",
    );
  }
  return data;
}

// A tick label is centred on its tick, so half of it overhangs its axis's
// end, less half a grid line stroke; an inset one overhangs nothing.
function tickLabelOverhang(
  alignment: "center" | "inset",
  halfTickLabelExtent: number,
  gridLineStrokeWidth: number,
): number {
  return alignment === "inset"
    ? 0
    : Math.max(0, halfTickLabelExtent - gridLineStrokeWidth / 2);
}

// The axis beside a start side takes as much of its overhang as it is deep.
function absorbedStart(overhang: number, adjacentAxisExtent: number): number {
  return Math.max(0, overhang - adjacentAxisExtent);
}
