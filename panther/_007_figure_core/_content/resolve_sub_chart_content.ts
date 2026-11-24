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
import type { ValueRange } from "../types.ts";
import { computeBarThicknesses } from "./bar_thickness.ts";
import {
  valueRangeOfAxis,
  zeroLineValue,
} from "./calculate_mapped_coordinates.ts";
import {
  type BarSpan,
  buildDataLabelTextStyle,
  groupSeriesByValueAxis,
  placeSeriesOnValueAxes,
  type ResolvedBarDataLabelPosition,
  type ResolvedCascadeArrow,
  type ResolvedChartConnector,
  type ResolvedDataLabel,
  type ResolvedSeries,
  type ResolvedValue,
  type SubChartContent,
} from "./content_generation_types.ts";
import { cascadeArrowLabelStandoff } from "./generate_cascade_arrow_primitives.ts";
import type { Orientation, ValueAxisSide } from "./orientation_helpers.ts";

type TextFormatter = MergedContentStyle["points"]["textFormatter"];

type PointLabelPosition = ReturnType<
  MergedContentStyle["points"]["getStyle"]
>["dataLabelPosition"];

type Stack = {
  stackTotal: number;
  topPositions: number[];
};

type ValueStyles = Pick<ResolvedValue, "info" | "point" | "bar"> & {
  value: number;
  barDrawn: boolean;
};

type DrawnBar = {
  info: ChartValueInfo;
  value: number;
  endSideEdgeValue: number;
};

type BarEnds = {
  span: BarSpan;
  labelAnchorValue: number;
  labelSide: ValueAxisSide;
};

// A drawn value's place in its value axis's stack at its value index.
type SeriesStacking = {
  stack: Stack | undefined;
  barEnds: BarEnds;
};

type DataLabelClaim =
  & {
    dataLabel: DataLabelStyle;
    textFormatter: TextFormatter;
    offset: number;
    anchorValue: number;
    maxWidth: number;
  }
  & (
    | { owner: Exclude<ResolvedDataLabel["owner"], "bars"> }
    | ({ owner: "bars" } & ResolvedBarDataLabelPosition)
  );

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

  const drawnValues = Array.from(
    { length: subChart.nValues },
    (_, i_value) =>
      p.seriesValues.map((values) =>
        subChart.positionOrdinals[i_value] === undefined
          ? undefined
          : values[i_value]
      ),
  );
  const valueAxisGroups = groupSeriesByValueAxis(subChart.seriesValueAxes);
  const seriesPlaces = placeSeriesOnValueAxes(subChart.seriesValueAxes);

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
        valueAxis: subChart.seriesValueAxes[i_series],
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

  const valueStyles = resolvedSeries.map((series, i_series) => {
    const valueRange = valueRangeOfAxis(
      subChart,
      subChart.seriesValueAxes[i_series],
    );
    const place = seriesPlaces[i_series];
    return drawnValues.map(
      (atValueIndex, i_value): ValueStyles | undefined => {
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
          valueMin: valueRange.valueMin,
          valueMax: valueRange.valueMax,
          indicatorMember: dims.indicator?.members[i_value],
        };
        const point = s.points.getStyle(info);
        const bar = s.bars.getStyle(info);
        return {
          info,
          value,
          point,
          bar,
          barDrawn: isBarDrawn(bar, stacking, atValueIndex, place.previous),
        };
      },
    );
  });

  // A series drawn as a line or as points takes no part of the bar group, so
  // a lone bar series stands on its slot's centre, where they stand.
  const barSeriesIndices = valueStyles.flatMap((atSeries, i_series) =>
    atSeries.some((styles) => styles?.barDrawn === true) ? [i_series] : []
  );
  const { barThickness } = computeBarThicknesses(
    subChart.slotExtent,
    barSeriesIndices.length,
    s.bars,
  );

  const seriesStacking = drawnValues.map((atValueIndex, i_value) =>
    valueAxisGroups.reduce<SeriesStacking[]>((bySeries, group) => {
      const onAxis = group.seriesIndices.map((i_series) =>
        atValueIndex[i_series]
      );
      const stack = stacking === "none" ? undefined : resolveStack(
        onAxis,
        group.seriesIndices.map((i_series) =>
          valueStyles[i_series][i_value]?.barDrawn === true
        ),
        stacking,
      );
      const barEnds = resolveBarEnds(
        stacking,
        onAxis,
        valueRangeOfAxis(subChart, group.valueAxis),
      );
      group.seriesIndices.forEach((i_series, position) => {
        bySeries[i_series] = { stack, barEnds: barEnds[position] };
      });
      return bySeries;
    }, [])
  );

  const resolvedValues = valueStyles.map((atSeries, i_series) => {
    const series = resolvedSeries[i_series];
    const place = seriesPlaces[i_series];
    return atSeries.map(
      (styles, i_value): ResolvedValue | undefined => {
        if (styles === undefined) {
          return undefined;
        }
        const { info, value, point, bar, barDrawn } = styles;
        const { stack, barEnds } = seriesStacking[i_value][i_series];
        const stackInfo = stack === undefined ? undefined : {
          isTopOfStack: stack.topPositions.includes(place.position),
          stackTotal: stack.stackTotal,
          positionInStack: place.position,
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
            ? barDrawn && claimsBarLabel(bar, stacking, stackInfo)
              ? barLabelClaim(
                bar,
                barEnds,
                s.bars.textFormatter,
                p.orientation,
                barThickness,
              )
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
          barSpan: barDrawn ? barEnds.span : undefined,
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
      },
    );
  });

  const resolvedConnectors = drawnValues.flatMap((atValueIndex, i_value) =>
    valueAxisGroups.flatMap((group): ResolvedChartConnector[] => {
      const endpoints = connectorEndpoints(
        group.seriesIndices.map((i_series) => atValueIndex[i_series]),
        s.connectors.joinAcrossGaps,
      ).map(({ position, value }) => ({
        i_series: group.seriesIndices[position],
        value,
      }));
      const first = endpoints.length < 2
        ? undefined
        : resolvedValues[endpoints[0].i_series][i_value]?.info;
      if (first === undefined) {
        return [];
      }
      const info: ChartConnectorInfo = {
        valueAxis: group.valueAxis,
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
    })
  );

  const resolvedCascadeArrows = p.orientation === "vertical"
    ? resolvedValues.flatMap((atSeries, i_series) =>
      resolveCascadeArrows(
        rc,
        subChart.slotOrder.flatMap((i_value): DrawnBar[] => {
          const resolvedValue = atSeries[i_value];
          const value = drawnValues[i_value][i_series];
          const span = resolvedValue?.barSpan;
          return resolvedValue === undefined || value === undefined ||
              span === undefined
            ? []
            : [{
              info: resolvedValue.info,
              value,
              endSideEdgeValue: Math.max(span.from, span.to),
            }];
        }),
        s.cascadeArrows,
      )
    )
    : [];

  return {
    resolvedSeries,
    resolvedValues,
    barSeriesIndices,
    resolvedConnectors,
    resolvedCascadeArrows,
  };
}

// Under diff bars, a bar after its value axis's first series needs the
// previous series of its axis to have a drawn value.
function isBarDrawn(
  bar: ResolvedValue["bar"],
  stacking: MergedContentStyle["bars"]["stacking"],
  atValueIndex: (number | undefined)[],
  previousOnAxis: number | undefined,
): boolean {
  return bar.show === true &&
    (stacking !== "diff" || previousOnAxis === undefined ||
      atValueIndex[previousOnAxis] !== undefined);
}

// A bar's label stands where no other bar does. Under stacked bars a bar's
// centre is its own and its value end is clear only at the top of its stack;
// imposed and diff bars overlay one another, so only a top is clear of the
// bars drawn over it.
function claimsBarLabel(
  bar: ResolvedValue["bar"],
  stacking: MergedContentStyle["bars"]["stacking"],
  stackInfo: ResolvedValue["stackInfo"],
): boolean {
  return stackInfo === undefined || stackInfo.isTopOfStack ||
    (stacking === "stacked" && bar.dataLabelPosition === "center");
}

// On a vertical chart a label wraps at its bar's thickness, and a centre
// label's halo stands inside that thickness too. Its text is centred on the
// bar, so its halo's wider side reaches out on both.
function barLabelClaim(
  bar: ResolvedValue["bar"],
  barEnds: BarEnds,
  textFormatter: TextFormatter,
  orientation: Orientation,
  barThickness: number,
): DataLabelClaim {
  const dataLabel = bar.dataLabel;
  const claimed = {
    owner: "bars" as const,
    dataLabel,
    textFormatter,
    offset: dataLabel.offset,
  };
  if (bar.dataLabelPosition === "center") {
    const halo = buildLabelHalo(dataLabel);
    const haloAcross = halo === undefined
      ? 0
      : 2 * Math.max(halo.padding.pl(), halo.padding.pr()) +
        (halo.borderWidth ?? 0);
    return {
      ...claimed,
      position: "center",
      anchorValue: (barEnds.span.from + barEnds.span.to) / 2,
      maxWidth: orientation === "horizontal"
        ? Number.POSITIVE_INFINITY
        : Math.max(0, barThickness - haloAcross),
    };
  }
  return {
    ...claimed,
    position: "outside-end",
    anchorValue: barEnds.labelAnchorValue,
    side: barEnds.labelSide,
    maxWidth: orientation === "horizontal"
      ? Number.POSITIVE_INFINITY
      : barThickness,
  };
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

// onAxis holds the values of one value axis's series at a value index, and
// drawn whether each one's bar is drawn, by position among those series.
// Stacked and imposed bars stand from the zero line, so each side of it has
// an outermost bar, whose value end holds a label; diff bars chain from the
// previous series and have one. A value whose bar is not drawn has no end to
// hold one, so it is never a top.
function resolveStack(
  onAxis: (number | undefined)[],
  drawn: boolean[],
  stacking: "stacked" | "imposed" | "diff",
): Stack {
  const lastDrawn = (onSide: (value: number) => boolean) =>
    onAxis.findLastIndex((value, position) =>
      value !== undefined && drawn[position] && onSide(value)
    );
  const tops = stacking === "diff"
    ? [lastDrawn(() => true)]
    : [lastDrawn((value) => value >= 0), lastDrawn((value) => value < 0)];
  return {
    stackTotal: stacking === "stacked" ? sumOfDefined(onAxis) : Math.max(
      ...onAxis.filter((value): value is number => value !== undefined),
    ),
    topPositions: tops.filter((position) => position !== -1),
  };
}

// An entry where the series has no drawn value is never read. Where zero lies
// off the axis, a bar's end beyond the zero line toward zero stands at it. An
// end within a billionth of the value range of the zero line stands on it,
// since tick values and running sums carry float noise (an axis ending at the
// tick -0.19999999999999996 under a stack bottom of -0.2) that would otherwise
// decide whether a bar takes the half stroke or paints it alone.
function resolveBarEnds(
  stacking: MergedContentStyle["bars"]["stacking"],
  atValueIndex: (number | undefined)[],
  valueRange: ValueRange,
): BarEnds[] {
  const zeroLine = zeroLineValue(valueRange);
  const nearZeroLine = (valueRange.valueMax - valueRange.valueMin) * 1e-9;
  const cutAtZeroLine = (value: number): number =>
    Math.abs(value - zeroLine) <= nearZeroLine
      ? zeroLine
      : valueRange.valueMin > 0
      ? Math.max(value, zeroLine)
      : valueRange.valueMax < 0
      ? Math.min(value, zeroLine)
      : value;
  let positiveTop = 0;
  let negativeTop = 0;
  return atValueIndex.map((value, i_series): BarEnds => {
    const own = value ?? 0;
    const stackBottom = own < 0 ? negativeTop : positiveTop;
    const stackTop = stackBottom + own;
    if (own < 0) {
      negativeTop = stackTop;
    } else {
      positiveTop = stackTop;
    }
    const previous = i_series > 0 ? atValueIndex[i_series - 1] : undefined;
    if (stacking === "diff" && previous !== undefined) {
      const span = { from: cutAtZeroLine(previous), to: cutAtZeroLine(own) };
      return {
        span,
        labelAnchorValue: Math.max(span.from, span.to),
        labelSide: "end",
      };
    }
    const span = {
      from: cutAtZeroLine(stacking === "stacked" ? stackBottom : 0),
      to: cutAtZeroLine(stacking === "stacked" ? stackTop : own),
    };
    return {
      span,
      labelAnchorValue: span.to,
      labelSide: span.to < span.from ? "start" : "end",
    };
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
  const measured = {
    mText,
    halo,
    offset: claim.offset,
    anchorValue: claim.anchorValue,
  };
  if (claim.owner === "bars") {
    return claim.position === "center"
      ? { ...measured, owner: "bars", position: "center", endExtent: 0 }
      : {
        ...measured,
        owner: "bars",
        position: "outside-end",
        side: claim.side,
        endExtent: claim.side === "end" ? claim.offset + extent + outset : 0,
      };
  }
  return {
    ...measured,
    owner: claim.owner,
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

// The endpoints of one value axis's connector, each at its position among
// that axis's series.
function connectorEndpoints(
  onAxis: (number | undefined)[],
  joinAcrossGaps: boolean,
): { position: number; value: number }[] {
  const firstPosition = onAxis.findIndex((value) => value !== undefined);
  const gapPosition = joinAcrossGaps ? -1 : onAxis.findIndex(
    (value, position) => position > firstPosition && value === undefined,
  );
  return onAxis
    .slice(0, gapPosition === -1 ? undefined : gapPosition)
    .flatMap((value, position) =>
      value === undefined ? [] : [{ position, value }]
    );
}
