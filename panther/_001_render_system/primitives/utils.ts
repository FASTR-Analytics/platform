// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlignH,
  type AlignV,
  Coordinates,
  getRectAlignmentCoords,
  Padding,
  RectCoordsDims,
} from "../deps.ts";
import type { MeasuredText, PathSegment } from "../render_context.ts";

export function computeBoundsForPoint(
  coords: Coordinates,
  radius: number,
): RectCoordsDims {
  return new RectCoordsDims({
    x: coords.x() - radius,
    y: coords.y() - radius,
    w: radius * 2,
    h: radius * 2,
  });
}

export function computeBoundsForPath(
  coords: Coordinates[],
  strokeWidth: number = 0,
): RectCoordsDims {
  if (coords.length === 0) {
    return new RectCoordsDims({ x: 0, y: 0, w: 0, h: 0 });
  }
  // One pass, not Math.min(...xs): a detailed map region's vertex list
  // overflows the call stack as spread arguments.
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const c of coords) {
    minX = Math.min(minX, c.x());
    maxX = Math.max(maxX, c.x());
    minY = Math.min(minY, c.y());
    maxY = Math.max(maxY, c.y());
  }
  const halfStroke = strokeWidth / 2;
  const x = minX - halfStroke;
  const y = minY - halfStroke;
  return new RectCoordsDims({
    x,
    y,
    w: maxX + halfStroke - x,
    h: maxY + halfStroke - y,
  });
}

export function unionRectCoordsDims(rects: RectCoordsDims[]): RectCoordsDims {
  return computeBoundsForPath(
    rects.flatMap((r) => [r.topLeftCoords(), r.bottomRightCoords()]),
  );
}

// The rect a label of this alignment occupies around its anchor point, grown
// by its padding.
export function labelBoxRcd(
  mText: MeasuredText,
  position: Coordinates,
  alignH: AlignH,
  alignV: AlignV,
  padding?: Padding,
): RectCoordsDims {
  const textW = mText.dims.w();
  const textH = mText.dims.h();
  const pad = padding ?? new Padding(0);

  let bgX = position.x() - pad.pl();
  let bgY = position.y() - pad.pt();

  if (alignH === "center") bgX -= textW / 2;
  else if (alignH === "right") bgX -= textW;
  if (alignV === "middle") bgY -= textH / 2;
  else if (alignV === "bottom") bgY -= textH;

  return new RectCoordsDims({
    x: bgX,
    y: bgY,
    w: textW + pad.pl() + pad.pr(),
    h: textH + pad.pt() + pad.pb(),
  });
}

// The box text aligned in an anchor rect paints, as rText places it.
export function textBoxInAnchor(
  mText: MeasuredText,
  anchorRcd: RectCoordsDims,
  alignH: AlignH,
  alignV: AlignV,
): RectCoordsDims {
  return labelBoxRcd(
    mText,
    new Coordinates(getRectAlignmentCoords(anchorRcd, alignH, alignV)),
    alignH,
    alignV,
  );
}

// Every point the path touches, control points included. The convex hull of a
// bezier's control points contains the curve, so feeding these to
// computeBoundsForPath gives a correct (slightly conservative) bound.
export function pathSegmentPoints(segments: PathSegment[]): Coordinates[] {
  return segments.flatMap((s) =>
    s.type === "bezierCurveTo"
      ? [
        new Coordinates([s.cp1x, s.cp1y]),
        new Coordinates([s.cp2x, s.cp2y]),
        new Coordinates([s.x, s.y]),
      ]
      : [new Coordinates([s.x, s.y])]
  );
}
