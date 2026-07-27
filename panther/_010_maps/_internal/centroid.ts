// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DistanceField, Point, Ring } from "../deps.ts";
import { buildDistanceField } from "../deps.ts";
import type { GeoJSONGeometry, GeoJSONPosition } from "./geojson_types.ts";
import { getPolygonRings } from "./geo_helpers.ts";
import type { FittedProjection } from "./fit_projection.ts";

export function computeGeoCentroid(
  geometry: GeoJSONGeometry,
): [number, number] | undefined {
  const polygons = getPolygonRings(geometry);
  if (polygons.length === 0) return undefined;

  let totalArea = 0;
  let cx = 0;
  let cy = 0;

  for (const polygon of polygons) {
    const ring = polygon[0];
    if (!ring || ring.length < 3) continue;

    const result = ringCentroid(ring);
    if (result.area === 0) continue;

    const absArea = Math.abs(result.area);
    totalArea += absArea;
    cx += result.cx * absArea;
    cy += result.cy * absArea;
  }

  if (totalArea === 0) return undefined;
  return [cx / totalArea, cy / totalArea];
}

function ringCentroid(
  ring: GeoJSONPosition[],
): { cx: number; cy: number; area: number } {
  let area = 0;
  let cx = 0;
  let cy = 0;
  const n = ring.length;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const cross = xi * yj - xj * yi;
    area += cross;
    cx += (xi + xj) * cross;
    cy += (yi + yj) * cross;
  }

  area /= 2;
  if (area === 0) return { cx: 0, cy: 0, area: 0 };
  cx /= 6 * area;
  cy /= 6 * area;
  return { cx, cy, area };
}

export function projectCentroid(
  geoCentroid: [number, number],
  fitted: FittedProjection,
  offset?: { dx: number; dy: number },
): { x: number; y: number } {
  const [sx, sy] = fitted.project(geoCentroid[0], geoCentroid[1]);
  return {
    x: sx + (offset?.dx ?? 0),
    y: sy + (offset?.dy ?? 0),
  };
}

// Every ring of a geometry projected to screen coordinates. Built once per
// cell at unit scale and cached: scaling a projection is affine, so anchors,
// bboxes and raycasts at any content scale s are the unit values × s — the
// budget solver can call the placer dozens of times without re-projecting.
export type ScreenRings = [number, number][][];

export function projectRings(
  geometry: GeoJSONGeometry,
  fitted: FittedProjection,
): ScreenRings {
  const out: ScreenRings = [];
  for (const polygon of getPolygonRings(geometry)) {
    for (const ring of polygon) {
      out.push(ring.map((coord) => fitted.project(coord[0], coord[1])));
    }
  }
  return out;
}

export function bboxOfScreenRings(
  rings: ScreenRings,
): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const ring of rings) {
    for (const [sx, sy] of ring) {
      if (sx < minX) minX = sx;
      if (sx > maxX) maxX = sx;
      if (sy < minY) minY = sy;
      if (sy > maxY) maxY = sy;
    }
  }

  if (minX === Infinity) return undefined;
  return { minX, minY, maxX, maxY };
}

// The pole of inaccessibility: the interior point furthest from the region's
// own boundary (plan I2), with the room around it (plan I3).
//
// The area-weighted centroid is the wrong anchor for a label and wrong in a way
// that shows: for a crescent, a ring, or a country whose mass is split across
// islands it falls OUTSIDE the region it names. The pole is inside by
// construction, and it is the point with the most room around it, which is
// exactly what a label wants.
export type RegionPole = {
  point: { x: number; y: number };
  // Does a w x h box centred on the pole lie entirely inside the region? This
  // is the room that actually exists — a bounding box massively overstates it
  // for anything non-convex, which is how labels were kept inside regions they
  // could not fit in.
  fitsBox: (w: number, h: number) => boolean;
};

// The pole is scale-equivariant, so it is read off a NORMALISED copy of the
// rings and mapped back. That is not a nicety: unit-scale projections span a
// fraction of a DU, where any sensible raster pitch gives a 2x2 grid. The
// extent and pitch below fix the answer's resolution at ~1% of a region's
// longer side, which is far finer than the question — the pole only has to be
// inside and roughly central, and the capacity only has to judge a label.
const POLE_NORMALISED_EXTENT = 192;
const POLE_PITCH = 2;

export function computeRegionPole(
  rings: ScreenRings,
): RegionPole | undefined {
  const bbox = bboxOfScreenRings(rings);
  if (!bbox) return undefined;
  const extent = Math.max(bbox.maxX - bbox.minX, bbox.maxY - bbox.minY);
  if (!(extent > 0)) return undefined;

  const k = POLE_NORMALISED_EXTENT / extent;
  const scaled: Ring[] = rings.map((ring) =>
    ring.map(([x, y]) => ({ x: x * k, y: y * k }))
  );
  const field = buildDistanceField(scaled, {
    pitch: POLE_PITCH,
    margin: 0,
    // Nothing here ever reads outside the shape, so the exact-segment
    // refinement past the boundary would be built and thrown away.
    exactBand: 0,
  });

  const max = field.interiorMax();
  // A region too thin for a single sample to land inside it. The caller keeps
  // the centroid rather than inventing a point.
  if (!max) return undefined;

  return {
    point: { x: max.point.x / k, y: max.point.y / k },
    fitsBox: (w, h) => boxFitsField(field, max.point, w * k, h * k),
  };
}

// The field is 1-Lipschitz and the box is convex, so the box's minimum sits on
// its perimeter — and a sample of d there guarantees at least d - step/2 over
// the half-step around it. Walking at `step` and demanding more than step/2
// therefore PROVES the box is inside, rather than hoping no intrusion fell
// between two samples. The cost is one normalised unit of conservatism.
function boxFitsField(
  field: DistanceField,
  centre: Point,
  w: number,
  h: number,
): boolean {
  const hw = w / 2;
  const hh = h / 2;
  const floor = POLE_PITCH / 2;
  const nx = Math.max(1, Math.ceil(w / POLE_PITCH));
  const ny = Math.max(1, Math.ceil(h / POLE_PITCH));
  for (let i = 0; i <= nx; i++) {
    const x = centre.x - hw + (w * i) / nx;
    if (field.distanceAt(x, centre.y - hh) <= floor) return false;
    if (field.distanceAt(x, centre.y + hh) <= floor) return false;
  }
  for (let j = 0; j <= ny; j++) {
    const y = centre.y - hh + (h * j) / ny;
    if (field.distanceAt(centre.x - hw, y) <= floor) return false;
    if (field.distanceAt(centre.x + hw, y) <= floor) return false;
  }
  return true;
}

// The silhouette raycast: the extreme x at which the horizontal scanline atY
// crosses any ring edge. undefined when the scanline misses every ring.
export function intersectScreenRingsAtY(
  rings: ScreenRings,
  side: "left" | "right",
  atY: number,
): number | undefined {
  let bestX: number | undefined;

  for (const ring of rings) {
    for (let i = 0; i < ring.length; i++) {
      const [x1, y1] = ring[i];
      const [x2, y2] = ring[(i + 1) % ring.length];

      if (y1 === y2) continue;

      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      if (atY < minY || atY > maxY) continue;

      const t = (atY - y1) / (y2 - y1);
      const intersectX = x1 + t * (x2 - x1);

      if (bestX === undefined) {
        bestX = intersectX;
      } else if (side === "left") {
        bestX = Math.min(bestX, intersectX);
      } else {
        bestX = Math.max(bestX, intersectX);
      }
    }
  }

  return bestX;
}
