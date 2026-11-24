// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type FigureLabelPrimitive,
  labelBoxRcd,
  type LabelCollisionConfig,
  type Primitive,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import {
  type ChartItemDataDimensions,
  scatterPointItem,
} from "../chart_items.ts";
import {
  type InsideCollisionLabel,
  resolveInsideCollisions,
} from "../_labels/collision.ts";
import { withFigureLabelBounds } from "../_labels/generate_label_primitives.ts";
import type { SubChart } from "../sub_charts.ts";
import {
  valueAxisCoord,
  type ValueAxisMapping,
} from "./calculate_mapped_coordinates.ts";
import {
  dataLabelBox,
  type ResolvedScatterLabel,
  type ResolvedScatterPoint,
} from "./content_generation_types.ts";
import { pointLabelPlace } from "./generate_point_primitives.ts";

type ShownPoint = { point: ResolvedScatterPoint; coords: Coordinates };

// The collision moves the centre of the label's drawn box; its text stands
// textOffset from that centre, which a halo's uneven padding makes non-zero.
type PlacedLabel = {
  shown: ShownPoint;
  label: ResolvedScatterLabel;
  collision: InsideCollisionLabel;
  textOffset: { dx: number; dy: number };
};

export function scatterValueAxisMappings(
  subChart: Extract<SubChart, { kind: "value-and-value" }>,
): { x: ValueAxisMapping; y: ValueAxisMapping } {
  return {
    x: {
      subChartRcd: subChart.rcd,
      valueRange: subChart.xValueRange,
      valueClearance: subChart.xValueClearance,
      orientation: "horizontal",
    },
    y: {
      subChartRcd: subChart.rcd,
      valueRange: subChart.yValueRange,
      valueClearance: subChart.yValueClearance,
      orientation: "vertical",
    },
  };
}

export function generateScatterPrimitives(
  subChart: Extract<SubChart, { kind: "value-and-value" }>,
  itemDataDimensions: ChartItemDataDimensions,
  labelCollision: LabelCollisionConfig,
): Primitive[] {
  const { i_pane, i_tier, i_lane, rcd } = subChart;
  const { x: xMapping, y: yMapping } = scatterValueAxisMappings(subChart);
  const shown: ShownPoint[] = subChart.content.resolvedScatterPoints.flatMap(
    (point) =>
      point.style.show
        ? [{
          point,
          coords: new Coordinates([
            valueAxisCoord(point.info.xValue, xMapping),
            valueAxisCoord(point.info.yValue, yMapping),
          ]),
        }]
        : [],
  );
  const keySuffix = ({ info }: ResolvedScatterPoint) =>
    `${i_pane}-${i_tier}-${i_lane}-${info.i_series}-${info.i_indicator}`;

  const points: Primitive[] = shown.map(({ point, coords }) => {
    const { info, style } = point;
    const bounds = new RectCoordsDims({
      x: coords.x() - style.radius,
      y: coords.y() - style.radius,
      w: style.radius * 2,
      h: style.radius * 2,
    });
    return {
      type: "scatter-point",
      key: `scatter-point-${keySuffix(point)}`,
      item: scatterPointItem(itemDataDimensions, info),
      part: "marker",
      bounds,
      hitBounds: bounds,
      zIndex: Z_INDEX.CONTENT_POINT,
      meta: { point: info },
      annotationGroup: style.annotationGroup,
      coords,
      style,
    };
  });

  const placed = shown.flatMap((s): PlacedLabel[] =>
    s.point.label === undefined
      ? []
      : [placeAtNaturalPlace(s, s.point.label, rcd, labelCollision.gap)]
  );
  resolveInsideCollisions(
    placed.map((p) => p.collision),
    labelCollision.maxIterations,
    labelCollision.maxCentroidDisplacement,
  );

  const labels = placed.map((
    { shown: { point, coords }, label, collision, textOffset },
  ) => {
    const textCentre = new Coordinates([
      collision.x + textOffset.dx,
      collision.y + textOffset.dy,
    ]);
    return withFigureLabelBounds({
      type: "figure-label",
      key: `scatter-label-${keySuffix(point)}`,
      item: scatterPointItem(itemDataDimensions, point.info),
      part: "label",
      hostRcd: rcd,
      zIndex: Z_INDEX.FIGURE_LABEL,
      meta: {
        id: `${point.info.i_series}-${point.info.i_indicator}`,
        i_pane,
        i_tier,
        i_lane,
        i_indicator: point.info.i_indicator,
        paneMember: point.info.paneMember,
        tierMember: point.info.tierMember,
        laneMember: point.info.laneMember,
        indicatorMember: point.info.indicatorMember,
        placement: "inside",
      },
      mText: label.mText,
      position: textCentre,
      alignH: "center",
      alignV: "middle",
      halo: label.halo,
      leaderLine: leaderLineOf(
        coords,
        point.style.radius,
        label,
        textCentre,
      ),
    });
  });

  return [...points, ...labels];
}

// A label's collision box is its drawn box, with its halo's padding and half
// its border, grown by the gap, so drawn labels stand at least that far
// apart, and its centre is confined to where that drawn box stays in the
// sub-chart.
function placeAtNaturalPlace(
  shown: ShownPoint,
  label: ResolvedScatterLabel,
  host: RectCoordsDims,
  gap: number,
): PlacedLabel {
  const place = pointLabelPlace(shown.coords, label.side, label.offset);
  const text = labelBoxRcd(
    label.mText,
    place.position,
    place.alignH,
    place.alignV,
  );
  const drawn = dataLabelBox(label, place);
  const halfW = drawn.w() / 2;
  const halfH = drawn.h() / 2;
  return {
    shown,
    label,
    collision: {
      naturalX: drawn.centerX(),
      naturalY: drawn.centerY(),
      x: drawn.centerX(),
      y: drawn.centerY(),
      width: drawn.w() + gap,
      height: drawn.h() + gap,
      centerRange: {
        minX: host.x() + halfW,
        maxX: host.rightX() - halfW,
        minY: host.y() + halfH,
        maxY: host.bottomY() - halfH,
      },
    },
    textOffset: {
      dx: text.centerX() - drawn.centerX(),
      dy: text.centerY() - drawn.centerY(),
    },
  };
}

// Earned by distance: a label whose box stands further from its point's edge
// than the leader line's gap draws it, from the point's edge toward the
// label's centre, and the painter clamps it to the box and shortens it by
// the gap.
function leaderLineOf(
  centre: Coordinates,
  radius: number,
  label: ResolvedScatterLabel,
  labelCentre: Coordinates,
): FigureLabelPrimitive["leaderLine"] {
  const box = dataLabelBox(label, {
    position: labelCentre,
    alignH: "center",
    alignV: "middle",
  });
  const dx = Math.max(box.x() - centre.x(), 0, centre.x() - box.rightX());
  const dy = Math.max(box.y() - centre.y(), 0, centre.y() - box.bottomY());
  if (Math.hypot(dx, dy) - radius <= label.leaderLine.gap) {
    return undefined;
  }
  const toX = labelCentre.x() - centre.x();
  const toY = labelCentre.y() - centre.y();
  const length = Math.hypot(toX, toY);
  return {
    from: new Coordinates([
      centre.x() + radius * toX / length,
      centre.y() + radius * toY / length,
    ]),
    to: labelCentre,
    strokeColor: label.leaderLine.strokeColor,
    strokeWidth: label.leaderLine.strokeWidth,
    gap: label.leaderLine.gap,
  };
}
