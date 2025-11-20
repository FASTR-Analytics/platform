// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type BoxPrimitive,
  computeBoundsForPath,
  Coordinates,
  getAnchorCoords,
  getColor,
  type LineStyle,
  type MergedSimpleVizStyle,
  type Primitive,
  RectCoordsDims,
  Z_INDEX,
} from "../deps.ts";
import type { RawArrow, RawBox } from "../types.ts";

export function buildArrowPrimitives(
  arrows: RawArrow[],
  boxes: RawBox[],
  boxPrimitives: BoxPrimitive[],
  mergedSimpleVizStyle: MergedSimpleVizStyle,
): Primitive[] {
  const primitives: Primitive[] = [];

  for (const arrow of arrows) {
    if (arrow.type === "points") {
      // TODO: Handle explicit points arrows
      continue;
    }

    // Handle box-ids arrows
    const fromBoxPrim = boxPrimitives.find((b) =>
      b.meta.boxId === arrow.fromBoxID
    );
    const toBoxPrim = boxPrimitives.find((b) => b.meta.boxId === arrow.toBoxID);
    const fromBox = boxes.find((b) => b.id === arrow.fromBoxID);
    const toBox = boxes.find((b) => b.id === arrow.toBoxID);

    if (!fromBoxPrim || !toBoxPrim || !fromBox || !toBox) {
      console.warn(
        `Arrow ${arrow.id}: could not find boxes ${arrow.fromBoxID} or ${arrow.toBoxID}`,
      );
      continue;
    }

    // Get anchor points for arrow connection (arrow → box → defaults)
    const fromAnchor = arrow.arrowStartPoint ?? fromBox.arrowStartPoint ??
      mergedSimpleVizStyle.boxes.arrowStartPoint;
    const toAnchor = arrow.arrowEndPoint ?? toBox.arrowEndPoint ??
      mergedSimpleVizStyle.boxes.arrowEndPoint;
    const fromCenter = getAnchorCoords(fromBoxPrim.rcd, fromAnchor);
    const toCenter = getAnchorCoords(toBoxPrim.rcd, toAnchor);

    // Calculate edge intersection points with truncation
    const arrowDefaults = mergedSimpleVizStyle.arrows;
    const strokeWidth = arrow.style?.strokeWidth ?? arrowDefaults.strokeWidth;
    const arrowHalfStroke = strokeWidth / 2;

    const fromBoxStrokeWidth = fromBoxPrim.rectStyle.strokeWidth ?? 0;
    const toBoxStrokeWidth = toBoxPrim.rectStyle.strokeWidth ?? 0;
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
      strokeColor: getColor(
        arrow.style?.strokeColor ?? arrowDefaults.strokeColor,
      ),
      strokeWidth,
      lineDash: arrow.style?.lineDash ?? arrowDefaults.lineDash,
    };

    // Arrowhead
    const arrowheadSize = arrow.arrowheadSize !== undefined
      ? arrow.arrowheadSize
      : strokeWidth * 5;

    // Calculate arrowhead angle
    const angle = Math.atan2(
      toPoint.y() - fromPoint.y(),
      toPoint.x() - fromPoint.x(),
    );

    primitives.push({
      type: "simpleviz-arrow",
      key: `arrow-${arrow.id}`,
      bounds: computeBoundsForPath(pathCoords),
      zIndex: arrow.zIndex ?? Z_INDEX.SIMPLEVIZ_ARROW,
      meta: {
        arrowId: arrow.id,
        fromBoxId: arrow.fromBoxID,
        toBoxId: arrow.toBoxID,
      },
      pathCoords,
      lineStyle,
      arrowheadSize,
      arrowheads: {
        end: {
          position: toPoint,
          angle,
        },
      },
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
  const intersections: Array<{
    x: number;
    y: number;
    t: number;
    edge: "left" | "right" | "top" | "bottom";
  }> = [];

  // Left edge (x = left)
  if (dx !== 0) {
    const t = (left - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push({ x: left, y, t, edge: "left" });
    }
  }

  // Right edge (x = right)
  if (dx !== 0) {
    const t = (right - x1) / dx;
    const y = y1 + t * dy;
    if (t >= 0 && y >= top && y <= bottom) {
      intersections.push({ x: right, y, t, edge: "right" });
    }
  }

  // Top edge (y = top)
  if (dy !== 0) {
    const t = (top - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push({ x, y: top, t, edge: "top" });
    }
  }

  // Bottom edge (y = bottom)
  if (dy !== 0) {
    const t = (bottom - y1) / dy;
    const x = x1 + t * dx;
    if (t >= 0 && x >= left && x <= right) {
      intersections.push({ x, y: bottom, t, edge: "bottom" });
    }
  }

  // Get the intersection with smallest t > 0 (closest to start point)
  if (intersections.length === 0) {
    return from;
  }

  intersections.sort((a, b) => a.t - b.t);
  const intersection = intersections[0];

  // Calculate linear offset based on perpendicular distance to edge
  // For left/right edges: perpendicular is horizontal (X direction)
  // For top/bottom edges: perpendicular is vertical (Y direction)
  let linearOffset: number;
  if (intersection.edge === "left" || intersection.edge === "right") {
    // Perpendicular to vertical edge = horizontal distance
    // offset = perpendicular distance
    // linearOffset = offset / |cos(angle)| = offset / |ndx|
    linearOffset = Math.abs(ndx) > 0.001 ? offset / Math.abs(ndx) : offset;
  } else {
    // Perpendicular to horizontal edge = vertical distance
    // offset = perpendicular distance
    // linearOffset = offset / |sin(angle)| = offset / |ndy|
    linearOffset = Math.abs(ndy) > 0.001 ? offset / Math.abs(ndy) : offset;
  }

  // Move the intersection point outward by the linear offset distance
  return new Coordinates([
    intersection.x + ndx * linearOffset,
    intersection.y + ndy * linearOffset,
  ]);
}
