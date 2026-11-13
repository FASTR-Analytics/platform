// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Arrowhead,
  type ArrowheadFitFallback,
  type ChartConnectorInfo,
  type ChartSeriesInfo,
  computeBoundsForPath,
  Coordinates,
  type DimensionMember,
  type LineStyle,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import { chartConnectorItem } from "../chart_items.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import {
  buildSeriesInfo,
  buildValueInfo,
  type ContentGenerationContext,
} from "./content_generation_types.ts";

const MIN_VISIBLE_LINE = 2;

type Endpoint = {
  coord: Coordinates;
  value: number;
  i_series: number;
  seriesMember: DimensionMember | undefined;
  pointRadius: number;
};

export function generateConnectorPrimitives(
  mapped: MappedValueCoordinate[][],
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const s = ctx.contentStyle;
  const cs = s.connectors;
  const seriesInfos = Array.from(
    { length: ctx.nSerieses },
    (_, i) => buildSeriesInfo(ctx, i, mapped),
  );

  for (let i_value = 0; i_value < ctx.nValues; i_value++) {
    const endpoints = collectEndpoints(mapped, i_value, ctx, seriesInfos);
    if (endpoints.length < 2) continue;

    const info = buildConnectorInfo(endpoints, i_value, ctx);
    const style = cs.getStyle(info);
    if (!style.show) continue;

    const heads = computeArrowheads(
      endpoints,
      style.arrowhead,
      style.arrowHeadLength,
      cs.arrowheadFitFallback,
    );
    if (heads === "skip-connector") continue;

    const lineStyle: LineStyle = {
      strokeColor: style.strokeColor,
      strokeWidth: style.strokeWidth,
      lineDash: style.lineDash,
    };
    const coords = endpoints.map((e) => e.coord);
    const bounds = computeBoundsForPath(coords);

    primitives.push({
      type: "chart-connector",
      key:
        `connector-${ctx.subChartInfo.i_pane}-${ctx.subChartInfo.i_tier}-${ctx.subChartInfo.i_lane}-${i_value}`,
      item: chartConnectorItem(ctx.itemDataDimensions, info),
      part: "link",
      bounds,
      hitBounds: bounds,
      zIndex: Z_INDEX.CONTENT_CONNECTOR,
      annotationGroup: style.annotationGroup,
      meta: { connector: info },
      coords,
      style: lineStyle,
      arrowheads: heads,
    });
  }

  return primitives;
}

function collectEndpoints(
  mapped: MappedValueCoordinate[][],
  i_value: number,
  ctx: ContentGenerationContext,
  seriesInfos: ChartSeriesInfo[],
): Endpoint[] {
  const endpoints: Endpoint[] = [];
  const s = ctx.contentStyle;
  const joinAcrossGaps = s.connectors.joinAcrossGaps;

  for (let i_series = 0; i_series < ctx.nSerieses; i_series++) {
    const m = mapped[i_series][i_value];
    if (m === undefined) {
      if (!joinAcrossGaps && endpoints.length > 0) break;
      continue;
    }
    const valueInfo = buildValueInfo(
      ctx,
      seriesInfos[i_series],
      m.value,
      i_value,
    );
    const pointStyle = s.points.getStyle(valueInfo);
    endpoints.push({
      coord: m.coords,
      value: m.value,
      i_series,
      seriesMember: ctx.itemDataDimensions.series?.members[i_series],
      pointRadius: pointStyle.show ? pointStyle.radius : 0,
    });
  }

  return endpoints;
}

function buildConnectorInfo(
  endpoints: Endpoint[],
  i_value: number,
  ctx: ContentGenerationContext,
): ChartConnectorInfo {
  return {
    i_value,
    isFirstValue: i_value === ctx.slotOrder[0],
    isLastValue: i_value === ctx.slotOrder[ctx.slotOrder.length - 1],
    valueMin: ctx.valueRange.valueMin,
    valueMax: ctx.valueRange.valueMax,
    nValues: ctx.nValues,
    nSerieses: ctx.subChartInfo.nSerieses,
    seriesValueArrays: ctx.subChartInfo.seriesValueArrays,
    i_pane: ctx.subChartInfo.i_pane,
    nPanes: ctx.subChartInfo.nPanes,
    paneMember: ctx.subChartInfo.paneMember,
    i_tier: ctx.subChartInfo.i_tier,
    nTiers: ctx.subChartInfo.nTiers,
    tierMember: ctx.subChartInfo.tierMember,
    i_lane: ctx.subChartInfo.i_lane,
    nLanes: ctx.subChartInfo.nLanes,
    laneMember: ctx.subChartInfo.laneMember,
    seriesIndices: endpoints.map((e) => e.i_series),
    seriesMembers: endpoints.map((e) => e.seriesMember),
    values: endpoints.map((e) => e.value),
  };
}

function computeArrowheads(
  endpoints: Endpoint[],
  mode: "none" | "start" | "end" | "both",
  arrowHeadLength: number,
  fallback: ArrowheadFitFallback,
): { start?: Arrowhead; end?: Arrowhead } | "skip-connector" | undefined {
  if (mode === "none") return undefined;

  const wantStart = mode === "start" || mode === "both";
  const wantEnd = mode === "end" || mode === "both";
  const heads: { start?: Arrowhead; end?: Arrowhead } = {};

  if (wantStart) {
    const a = endpoints[0];
    const b = endpoints[1];
    const head = makeArrowhead(
      b.coord,
      a.coord,
      b.pointRadius,
      a.pointRadius,
      arrowHeadLength,
      fallback,
    );
    if (head === "skip-connector") return "skip-connector";
    if (head !== "drop") heads.start = head;
  }

  if (wantEnd) {
    const n = endpoints.length;
    const a = endpoints[n - 2];
    const b = endpoints[n - 1];
    const head = makeArrowhead(
      a.coord,
      b.coord,
      a.pointRadius,
      b.pointRadius,
      arrowHeadLength,
      fallback,
    );
    if (head === "skip-connector") return "skip-connector";
    if (head !== "drop") heads.end = head;
  }

  return heads;
}

// Build the arrowhead with its tip at the edge of `tipPoint` (offset back
// along the segment by `tipPointRadius`), pointing in the direction
// `from → tipPoint`. Returns:
//   - Arrowhead         — fits, render
//   - "drop"            — doesn't fit, omit this head only (line-only fallback)
//   - "skip-connector"  — doesn't fit, drop the entire connector (skip fallback)
function makeArrowhead(
  from: Coordinates,
  tipPoint: Coordinates,
  fromPointRadius: number,
  tipPointRadius: number,
  arrowHeadLength: number,
  fallback: ArrowheadFitFallback,
): Arrowhead | "drop" | "skip-connector" {
  const dx = tipPoint.x() - from.x();
  const dy = tipPoint.y() - from.y();
  const segLen = Math.sqrt(dx * dx + dy * dy);
  if (segLen === 0) {
    return fallback === "skip" ? "skip-connector" : "drop";
  }
  const angle = Math.atan2(dy, dx);
  const available = segLen - fromPointRadius - tipPointRadius;
  const required = arrowHeadLength + MIN_VISIBLE_LINE;
  const fits = available >= required;

  if (!fits) {
    if (fallback === "skip") return "skip-connector";
    if (fallback === "line-only") return "drop";
    // "force" falls through
  }

  const ux = dx / segLen;
  const uy = dy / segLen;
  const position = new Coordinates([
    tipPoint.x() - ux * tipPointRadius,
    tipPoint.y() - uy * tipPointRadius,
  ]);
  return { position, angle, size: arrowHeadLength };
}
