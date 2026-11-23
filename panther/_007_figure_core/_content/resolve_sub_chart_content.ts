// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CascadeArrowInfo,
  ChartConnectorInfo,
  ChartSeriesInfo,
  ChartValueInfo,
  DataLabelStyle,
  LabelHalo,
  MergedContentStyle,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { getDimensionMembers } from "../deps.ts";
import type { ChartItemDataDimensions } from "../chart_items.ts";
import { buildLabelHalo } from "../label_halo.ts";
import type { SubChart } from "../sub_charts.ts";
import { computeBarThicknesses } from "./bar_thickness.ts";
import {
  buildDataLabelTextStyle,
  type ResolvedCascadeArrow,
  type ResolvedChartConnector,
  type ResolvedDataLabel,
  type ResolvedSeries,
  type ResolvedValue,
  type SubChartContent,
} from "./content_generation_types.ts";
import { cascadeArrowLabelStandoff } from "./generate_cascade_arrow_primitives.ts";
import type { Orientation } from "./orientation_helpers.ts";

type TextFormatter = MergedContentStyle["points"]["textFormatter"];

type PointLabelPosition = ReturnType<
  MergedContentStyle["points"]["getStyle"]
>["dataLabelPosition"];

type Stack = {
  stackTotal: number;
  i_topSeries: number;
};

type DrawnBar = {
  info: ChartValueInfo;
  value: number;
  endSideEdgeValue: number;
};

type DataLabelClaim = {
  owner: ResolvedDataLabel["owner"];
  dataLabel: DataLabelStyle;
  textFormatter: TextFormatter;
  offset: number;
  anchorValue: number;
  maxWidth: number;
};

export function resolveSubChartContent(
  rc: RenderContext,
  subChart: Omit<
    Extract<SubChart, { kind: "category-and-value" }>,
    "rcd" | "valueClearance" | "content"
  >,
  p: {
    seriesValues: (number | undefined)[][];
    uncertaintyUbSeriesValues?: (number | undefined)[][];
    uncertaintyLbSeriesValues?: (number | undefined)[][];
    orientation: Orientation;
    itemDataDimensions: ChartItemDataDimensions;
    contentStyle: MergedContentStyle;
    dataLabelsTextStyle: TextInfoUnkeyed;
  },
): SubChartContent {
  const s = p.contentStyle;
  const stacking = s.bars.stacking;
  const dims = p.itemDataDimensions;
  const paneMembers = getDimensionMembers(dims.pane);
  const tierMembers = getDimensionMembers(dims.tier);
  const laneMembers = getDimensionMembers(dims.lane);
  const nSerieses = getDimensionMembers(dims.series).length;
  const hasBounds = p.uncertaintyUbSeriesValues !== undefined &&
    p.uncertaintyLbSeriesValues !== undefined;
  const { barThickness } = computeBarThicknesses(
    subChart.slotExtent,
    p.seriesValues.length,
    s.bars,
  );

  const drawnValues = Array.from(
    { length: subChart.nValues },
    (_, i_value) =>
      p.seriesValues.map((values) =>
        subChart.positionOrdinals[i_value] === undefined
          ? undefined
          : values[i_value]
      ),
  );
  const stacks = stacking === "none"
    ? undefined
    : drawnValues.map((atValueIndex) => resolveStack(atValueIndex, stacking));
  const endSideEdgeValues = drawnValues.map((atValueIndex) =>
    barEndSideEdgeValues(stacking, atValueIndex)
  );

  const resolvedSeries = p.seriesValues.map(
    (_, i_series): ResolvedSeries => {
      const info: ChartSeriesInfo = {
        nSerieses,
        seriesValueArrays: p.seriesValues,
        i_pane: subChart.i_pane,
        nPanes: paneMembers.length,
        paneMember: paneMembers[subChart.i_pane],
        i_tier: subChart.i_tier,
        nTiers: tierMembers.length,
        tierMember: tierMembers[subChart.i_tier],
        i_lane: subChart.i_lane,
        nLanes: laneMembers.length,
        laneMember: laneMembers[subChart.i_lane],
        i_series,
        isFirstSeries: i_series === 0,
        isLastSeries: i_series === nSerieses - 1,
        seriesMember: dims.series?.members[i_series],
        nValues: subChart.nValues,
      };
      const line = s.lines.getStyle(info);
      return {
        info,
        line,
        area: s.areas.getStyle(info),
        errorBand: line.show && hasBounds
          ? s.errorBands.getStyle(info)
          : undefined,
      };
    },
  );

  const resolvedValues = resolvedSeries.map((series, i_series) =>
    drawnValues.map((atValueIndex, i_value): ResolvedValue | undefined => {
      const value = atValueIndex[i_series];
      if (value === undefined) {
        return undefined;
      }
      const info: ChartValueInfo = {
        ...series.info,
        value,
        i_value,
        isFirstValue: i_value === subChart.slotOrder[0],
        isLastValue:
          i_value === subChart.slotOrder[subChart.slotOrder.length - 1],
        valueMin: subChart.valueRange.valueMin,
        valueMax: subChart.valueRange.valueMax,
        indicatorMember: dims.indicator?.members[i_value],
      };
      const point = s.points.getStyle(info);
      const bar = s.bars.getStyle(info);
      const barDrawn = isBarDrawn(bar, stacking, atValueIndex, i_series);
      const stack = stacks?.[i_value];
      const stackInfo = stack === undefined ? undefined : {
        isTopOfStack: i_series === stack.i_topSeries,
        stackTotal: stack.stackTotal,
        positionInStack: i_series,
      };
      const hasBothBounds =
        p.uncertaintyUbSeriesValues?.[i_series]?.[i_value] !== undefined &&
        p.uncertaintyLbSeriesValues?.[i_series]?.[i_value] !== undefined;

      const claim: DataLabelClaim | undefined =
        point.show && point.dataLabel.show
          ? {
            owner: "points",
            dataLabel: point.dataLabel,
            textFormatter: s.points.textFormatter,
            offset: point.radius + point.dataLabel.offset,
            anchorValue: value,
            maxWidth: Number.POSITIVE_INFINITY,
          }
          : bar.show && bar.dataLabel.show
          ? barDrawn && stackInfo?.isTopOfStack !== false
            ? {
              owner: "bars",
              dataLabel: bar.dataLabel,
              textFormatter: s.bars.textFormatter,
              offset: bar.dataLabel.offset,
              anchorValue: endSideEdgeValues[i_value][i_series],
              maxWidth: p.orientation === "horizontal"
                ? Number.POSITIVE_INFINITY
                : barThickness,
            }
            : undefined
          : series.line.show && series.line.dataLabel.show
          ? {
            owner: "lines",
            dataLabel: series.line.dataLabel,
            textFormatter: s.lines.textFormatter,
            offset: series.line.dataLabel.offset,
            anchorValue: value,
            maxWidth: Number.POSITIVE_INFINITY,
          }
          : undefined;

      return {
        info,
        point,
        bar,
        stackInfo,
        errorBar: hasBothBounds && (barDrawn || point.show)
          ? s.errorBars.getStyle(info)
          : undefined,
        label: claim === undefined ? undefined : measureDataLabel(
          rc,
          claim,
          claim.textFormatter !== "none"
            ? claim.textFormatter(info)
            : String(value),
          point.dataLabelPosition,
          p,
        ),
      };
    })
  );

  const resolvedConnectors = drawnValues.flatMap(
    (atValueIndex, i_value): ResolvedChartConnector[] => {
      const endpoints = connectorEndpoints(
        atValueIndex,
        s.connectors.joinAcrossGaps,
      );
      const first = endpoints.length < 2
        ? undefined
        : resolvedValues[endpoints[0].i_series][i_value]?.info;
      if (first === undefined) {
        return [];
      }
      const info: ChartConnectorInfo = {
        i_value: first.i_value,
        isFirstValue: first.isFirstValue,
        isLastValue: first.isLastValue,
        valueMin: first.valueMin,
        valueMax: first.valueMax,
        nValues: first.nValues,
        nSerieses: first.nSerieses,
        seriesValueArrays: first.seriesValueArrays,
        i_pane: first.i_pane,
        nPanes: first.nPanes,
        paneMember: first.paneMember,
        i_tier: first.i_tier,
        nTiers: first.nTiers,
        tierMember: first.tierMember,
        i_lane: first.i_lane,
        nLanes: first.nLanes,
        laneMember: first.laneMember,
        seriesIndices: endpoints.map((endpoint) => endpoint.i_series),
        seriesMembers: endpoints.map((endpoint) =>
          resolvedSeries[endpoint.i_series].info.seriesMember
        ),
        values: endpoints.map((endpoint) => endpoint.value),
      };
      const style = s.connectors.getStyle(info);
      return style.show ? [{ info, style }] : [];
    },
  );

  const resolvedCascadeArrows = p.orientation === "vertical"
    ? resolvedValues.flatMap((atSeries, i_series) =>
      resolveCascadeArrows(
        rc,
        subChart.slotOrder.flatMap((i_value): DrawnBar[] => {
          const resolvedValue = atSeries[i_value];
          const value = drawnValues[i_value][i_series];
          return resolvedValue === undefined || value === undefined ||
              !isBarDrawn(
                resolvedValue.bar,
                stacking,
                drawnValues[i_value],
                i_series,
              )
            ? []
            : [{
              info: resolvedValue.info,
              value,
              endSideEdgeValue: endSideEdgeValues[i_value][i_series],
            }];
        }),
        s.cascadeArrows,
      )
    )
    : [];

  return {
    resolvedSeries,
    resolvedValues,
    resolvedConnectors,
    resolvedCascadeArrows,
  };
}

function isBarDrawn(
  bar: ResolvedValue["bar"],
  stacking: MergedContentStyle["bars"]["stacking"],
  atValueIndex: (number | undefined)[],
  i_series: number,
): boolean {
  return bar.show === true &&
    (stacking !== "diff" || i_series === 0 ||
      atValueIndex[i_series - 1] !== undefined);
}

function resolveCascadeArrows(
  rc: RenderContext,
  bars: DrawnBar[],
  cascadeArrows: MergedContentStyle["cascadeArrows"],
): ResolvedCascadeArrow[] {
  const pairs = bars.slice(1).map((to, i) => ({ from: bars[i], to }));
  const nArrows = pairs.length;
  const i_biggestDropoff = pairs.reduce(
    (biggest, { from, to }, i_arrow) => {
      const dropoff = from.value - to.value;
      return from.value !== 0 && dropoff > biggest.dropoff
        ? { i_arrow, dropoff }
        : biggest;
    },
    { i_arrow: -1, dropoff: 0 },
  ).i_arrow;
  return pairs.flatMap(({ from, to }, i_arrow): ResolvedCascadeArrow[] => {
    if (from.value === 0) {
      return [];
    }
    const absDropoff = from.value - to.value;
    const info: CascadeArrowInfo = {
      ...from.info,
      i_arrow,
      nArrows,
      isFirstArrow: i_arrow === 0,
      isLastArrow: i_arrow === nArrows - 1,
      fromValue: from.value,
      toValue: to.value,
      absDropoff,
      relDropoff: absDropoff / from.value,
      relRetention: to.value / from.value,
      isBiggestDropoff: i_arrow === i_biggestDropoff,
    };
    const style = cascadeArrows.getStyle(info);
    if (!style.show) {
      return [];
    }
    const text = !style.dataLabel.show
      ? ""
      : cascadeArrows.textFormatter !== "none"
      ? cascadeArrows.textFormatter(info)
      : String(info.relRetention);
    return [{
      info,
      style,
      from: from.info,
      to: to.info,
      label: text === "" ? undefined : measureCascadeArrowLabel(
        rc,
        text,
        style,
        cascadeArrows.text.labels,
        Math.max(from.endSideEdgeValue, to.endSideEdgeValue),
      ),
    }];
  });
}

function measureCascadeArrowLabel(
  rc: RenderContext,
  text: string,
  style: ResolvedCascadeArrow["style"],
  labelsTextStyle: TextInfoUnkeyed,
  anchorValue: number,
): NonNullable<ResolvedCascadeArrow["label"]> {
  const dl = style.dataLabel;
  const mText = rc.mText(
    text,
    buildDataLabelTextStyle(labelsTextStyle, dl),
    Number.POSITIVE_INFINITY,
  );
  const halo = buildLabelHalo(dl);
  return {
    mText,
    halo,
    anchorValue,
    endExtent: cascadeArrowLabelStandoff(mText, style) +
      endSideOutset(halo, "vertical"),
  };
}

function resolveStack(
  atValueIndex: (number | undefined)[],
  stacking: "stacked" | "imposed" | "diff",
): Stack {
  return {
    stackTotal: stacking === "stacked"
      ? sumOfDefined(atValueIndex)
      : atValueIndex.reduce<number>(
        (largest, value) =>
          value !== undefined && value > largest ? value : largest,
        0,
      ),
    i_topSeries: atValueIndex.findLastIndex((value) => value !== undefined),
  };
}

// An entry where the series has no drawn value is never read.
function barEndSideEdgeValues(
  stacking: MergedContentStyle["bars"]["stacking"],
  atValueIndex: (number | undefined)[],
): number[] {
  let stackTop = 0;
  return atValueIndex.map((value, i_series) => {
    const own = value ?? 0;
    stackTop += own;
    const previous = i_series > 0 ? atValueIndex[i_series - 1] : undefined;
    return stacking === "stacked"
      ? stackTop
      : stacking === "diff" && previous !== undefined
      ? Math.max(previous, own)
      : own;
  });
}

function sumOfDefined(values: (number | undefined)[]): number {
  return values.reduce<number>(
    (total, value) => value === undefined ? total : total + value,
    0,
  );
}

function measureDataLabel(
  rc: RenderContext,
  claim: DataLabelClaim,
  text: string,
  pointLabelPosition: PointLabelPosition,
  p: { orientation: Orientation; dataLabelsTextStyle: TextInfoUnkeyed },
): ResolvedDataLabel | undefined {
  const halo = buildLabelHalo(claim.dataLabel);
  if (!text.trim() && halo === undefined) {
    return undefined;
  }
  const mText = rc.mText(
    text,
    buildDataLabelTextStyle(p.dataLabelsTextStyle, claim.dataLabel),
    claim.maxWidth,
  );
  const extent = p.orientation === "horizontal"
    ? mText.dims.w()
    : mText.dims.h();
  const outset = endSideOutset(halo, p.orientation);
  return {
    owner: claim.owner,
    mText,
    halo,
    offset: claim.offset,
    anchorValue: claim.anchorValue,
    endExtent: claim.owner === "points"
      ? pointLabelEndExtent(
        pointLabelPosition,
        p.orientation,
        claim.offset,
        extent,
        outset,
      )
      : claim.offset + extent + outset,
  };
}

function endSideOutset(
  halo: LabelHalo | undefined,
  orientation: Orientation,
): number {
  if (halo === undefined) {
    return 0;
  }
  const padding = orientation === "horizontal"
    ? halo.padding.pr()
    : halo.padding.pt();
  return padding + (halo.borderWidth !== undefined ? halo.borderWidth / 2 : 0);
}

function pointLabelEndExtent(
  position: PointLabelPosition,
  orientation: Orientation,
  offset: number,
  extent: number,
  outset: number,
): number {
  const [endSide, startSide] = orientation === "horizontal"
    ? ["right", "left"]
    : ["top", "bottom"];
  if (position === endSide) {
    return offset + extent + outset;
  }
  if (position === startSide) {
    return 0;
  }
  return extent / 2 + outset;
}

function connectorEndpoints(
  atValueIndex: (number | undefined)[],
  joinAcrossGaps: boolean,
): { i_series: number; value: number }[] {
  const i_first = atValueIndex.findIndex((value) => value !== undefined);
  const i_gap = joinAcrossGaps ? -1 : atValueIndex.findIndex(
    (value, i_series) => i_series > i_first && value === undefined,
  );
  return atValueIndex
    .slice(0, i_gap === -1 ? undefined : i_gap)
    .flatMap((value, i_series) =>
      value === undefined ? [] : [{ i_series, value }]
    );
}
