// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Arrowhead,
  computeBoundsForPath,
  Coordinates,
  type LineStyle,
  type Primitive,
  Z_INDEX,
} from "../deps.ts";
import { chartConnectorItem } from "../chart_items.ts";
import type { MappedValueCoordinate } from "./calculate_mapped_coordinates.ts";
import type {
  ContentGenerationContext,
  SubChartContent,
} from "./content_generation_types.ts";

type ArrowheadFit = Pick<
  ContentGenerationContext["contentStyle"]["connectors"],
  "arrowheadFitFallback" | "arrowheadFitMinLineLength"
>;

type Endpoint = {
  coord: Coordinates;
  pointRadius: number;
};

export function generateConnectorPrimitives(
  mapped: MappedValueCoordinate[][],
  content: SubChartContent,
  ctx: ContentGenerationContext,
): Primitive[] {
  const primitives: Primitive[] = [];
  const { i_pane, i_tier, i_lane } = ctx.subChart;

  for (const { info, style } of content.resolvedConnectors) {
    const endpoints = info.seriesIndices.flatMap((i_series): Endpoint[] => {
      const mappedValue = mapped[i_series][info.i_value];
      const point = content.resolvedValues[i_series][info.i_value]?.point;
      if (mappedValue === undefined || point === undefined) {
        return [];
      }
      return [{
        coord: mappedValue.coords,
        pointRadius: point.show ? point.radius : 0,
      }];
    });

    const heads = computeArrowheads(
      endpoints,
      style.arrowhead,
      style.arrowHeadLength,
      ctx.contentStyle.connectors,
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
      key: `${
        info.valueAxis === "first" ? "connector" : "connector-second"
      }-${i_pane}-${i_tier}-${i_lane}-${info.i_value}`,
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

function computeArrowheads(
  endpoints: Endpoint[],
  mode: "none" | "start" | "end" | "both",
  arrowHeadLength: number,
  fit: ArrowheadFit,
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
      fit,
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
      fit,
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
  fit: ArrowheadFit,
): Arrowhead | "drop" | "skip-connector" {
  const dx = tipPoint.x() - from.x();
  const dy = tipPoint.y() - from.y();
  const segLen = Math.sqrt(dx * dx + dy * dy);
  if (segLen === 0) {
    return fit.arrowheadFitFallback === "skip" ? "skip-connector" : "drop";
  }
  const angle = Math.atan2(dy, dx);
  const available = segLen - fromPointRadius - tipPointRadius;
  const required = arrowHeadLength + fit.arrowheadFitMinLineLength;
  const fits = available >= required;

  if (!fits) {
    if (fit.arrowheadFitFallback === "skip") return "skip-connector";
    if (fit.arrowheadFitFallback === "line-only") return "drop";
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
