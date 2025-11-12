// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  getColor,
  type LineStyle,
  type Primitive,
  type RectCoordsDims,
} from "../deps.ts";
import type { RawArrow } from "../types.ts";

type BoxPrimitive = Extract<Primitive, { type: "simpleviz-box" }>;

export function transformArrows(
  arrows: RawArrow[],
  boxPrimitives: BoxPrimitive[],
  mergedSimpleVizStyle: any,
): Primitive[] {
  const primitives: Primitive[] = [];

  for (const arrow of arrows) {
    if (arrow.type === "points") {
      // TODO: Handle explicit points arrows
      continue;
    }

    // Handle box-ids arrows
    const fromBoxPrim = boxPrimitives.find(b => b.boxId === arrow.fromBoxID);
    const toBoxPrim = boxPrimitives.find(b => b.boxId === arrow.toBoxID);

    if (!fromBoxPrim || !toBoxPrim) {
      console.warn(`Arrow ${arrow.id}: could not find boxes ${arrow.fromBoxID} or ${arrow.toBoxID}`);
      continue;
    }

    // Get box centers and dimensions from primitives
    const fromCenter = fromBoxPrim.rcd.centerCoords();
    const toCenter = toBoxPrim.rcd.centerCoords();

    // Calculate edge intersection points with truncation
    const arrowDefaults = mergedSimpleVizStyle.arrows;
    const strokeWidth = arrow.style?.strokeWidth ?? arrowDefaults.strokeWidth;
    const arrowHalfStroke = strokeWidth / 2;

    const fromBoxStrokeWidth = fromBoxPrim.rectStyle.strokeWidth;
    const toBoxStrokeWidth = toBoxPrim.rectStyle.strokeWidth;
    const fromBoxHalfStroke = fromBoxStrokeWidth / 2;
    const toBoxHalfStroke = toBoxStrokeWidth / 2;

    const truncateStart = arrow.truncateStart ?? arrowDefaults.truncateStart;
    const truncateEnd = arrow.truncateEnd ?? arrowDefaults.truncateEnd;
    const startOffset = fromBoxHalfStroke + arrowHalfStroke + truncateStart;
    const endOffset = toBoxHalfStroke + arrowHalfStroke + truncateEnd;

    const fromPoint = getBoxEdgeIntersection(
      fromCenter,
      toCenter,
      fromBoxPrim.rcd,
      startOffset,
    );
    const toPoint = getBoxEdgeIntersection(
      toCenter,
      fromCenter,
      toBoxPrim.rcd,
      endOffset,
    );

    const pathCoords = [fromPoint, toPoint];

    // Line style
    const lineStyle: LineStyle = {
      strokeColor: getColor(arrow.style?.strokeColor ?? arrowDefaults.strokeColor),
      strokeWidth,
      lineDash: arrow.style?.lineDash ?? arrowDefaults.lineDash,
    };

    // Arrowhead
    const arrowheadSize = arrow.arrowheadSize !== undefined
      ? arrow.arrowheadSize
      : strokeWidth * 5;

    // Calculate arrowhead angle
    const angle = Math.atan2(toPoint.y() - fromPoint.y(), toPoint.x() - fromPoint.x());

    primitives.push({
      type: "simpleviz-arrow",
      key: `arrow-${arrow.id}`,
      layer: "content-line",
      pathCoords,
      lineStyle,
      arrowheadSize,
      arrowheads: {
        end: {
          position: toPoint,
          angle,
        },
      },
      arrowId: arrow.id,
    });
  }

  return primitives;
}

function getBoxEdgeIntersection(
  from: Coordinates,
  to: Coordinates,
  boxRcd: RectCoordsDims,
  offset: number,
): Coordinates {
  const x1 = from.x();
  const y1 = from.y();
  const x2 = to.x();
  const y2 = to.y();

  // Box boundaries
  const left = boxRcd.x();
  const right = boxRcd.rightX();
  const top = boxRcd.y();
  const bottom = boxRcd.bottomY();

  // Direction vector
  const dx = x2 - x1;
  const dy = y2 - y1;

  // If no movement, return center
  if (dx === 0 && dy === 0) {
    return from;
  }

  // Normalize direction vector
  const length = Math.sqrt(dx * dx + dy * dy);
  const ndx = dx / length;
  const ndy = dy / length;

  // Calculate intersection with each edge
  const intersections: Array<{ x: number; y: number; t: number }> = [];

  // Left edge (x = left)
  if (dx !== 0) {
    const t = (left - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push({ x: left, y, t });
    }
  }

  // Right edge (x = right)
  if (dx !== 0) {
    const t = (right - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push({ x: right, y, t });
    }
  }

  // Top edge (y = top)
  if (dy !== 0) {
    const t = (top - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push({ x, y: top, t });
    }
  }

  // Bottom edge (y = bottom)
  if (dy !== 0) {
    const t = (bottom - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push({ x, y: bottom, t });
    }
  }

  // Get the intersection with smallest t > 0 (closest to start point)
  if (intersections.length === 0) {
    return from;
  }

  intersections.sort((a, b) => a.t - b.t);
  const intersection = intersections[0];

  // Move the intersection point outward by the offset distance
  return new Coordinates([
    intersection.x + ndx * offset,
    intersection.y + ndy * offset,
  ]);
}
