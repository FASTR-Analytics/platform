// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DirectionalExtents,
  LabelCandidate,
  LabelGeometry,
  MergedMapStyle,
  OutsidePlacedBox,
  Primitive,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import {
  buildDataLabelTextStyle,
  Coordinates,
  generateResolvedFigureLabelPrimitives,
  placeOutsideBoxes,
} from "../deps.ts";
import type { FittedProjection } from "./fit_projection.ts";
import {
  bboxOfScreenRings,
  computeGeoCentroid,
  intersectScreenRingsAtY,
  projectCentroid,
  projectRings,
  type ScreenRings,
} from "./centroid.ts";
import type { ShownMapRegion } from "./generate_map_region_primitives.ts";
import {
  buildMapRegionInfo,
  measureMapLabel,
  resolveMapLabelText,
  toLabelMode,
} from "./label_shared.ts";

type CellIndices = {
  paneIndex: number;
  tierIndex: number;
  laneIndex: number;
};

// The label-bearing facts of one region, shared by the drawn candidates and
// the autofit floor budget so the two can never disagree on which labels
// exist or what they say.
export type MapLabelSpec = {
  id: string;
  text: string;
  dl: LabelCandidate["dataLabel"];
  offset: { dx: number; dy: number };
  feature: ShownMapRegion["feature"];
};

export function collectMapLabelSpecs(
  shown: ShownMapRegion[],
  mergedStyle: MergedMapStyle,
  indices: CellIndices,
): MapLabelSpec[] {
  const specs: MapLabelSpec[] = [];
  for (const region of shown) {
    const dl = region.style.dataLabel;
    if (!dl.show) continue;

    const text = resolveMapLabelText(
      mergedStyle.content.mapRegions.textFormatter,
      buildMapRegionInfo(
        region.featureId,
        region.feature,
        region.value,
        indices.paneIndex,
        indices.tierIndex,
        indices.laneIndex,
      ),
    );
    if (!text) continue;

    specs.push({
      id: region.featureId,
      text,
      dl,
      offset: {
        dx: region.style.centroidOffset?.dx ?? 0,
        dy: region.style.centroidOffset?.dy ?? 0,
      },
      feature: region.feature,
    });
  }
  return specs;
}

// One label-bearing region with everything the budget placer needs, at UNIT
// scale (projection scale 1, content-centred): scaling is affine, so anchors,
// bboxes and raycasts at any content scale s are the unit values × s. The
// centroidOffset is in screen DU and does not scale.
export type MapLabelEntry = {
  id: string;
  mText: LabelCandidate["mText"];
  dl: LabelCandidate["dataLabel"];
  offset: { dx: number; dy: number };
  unitAnchor: { x: number; y: number };
  // The flank, frozen at s0 alongside the placement split: centroidOffset.dx
  // is in screen DU while unitAnchor.x scales with s, so the anchor-vs-centre
  // sign can vary with s — one decision, in one frame, used by solve and
  // emission alike (adversarial review F1).
  side: "left" | "right";
  // Present only in "auto" mode, for the s0 placement freeze.
  unitBBox?: { w: number; h: number };
};

export function buildMapLabelEntries(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  shown: ShownMapRegion[],
  mergedStyle: MergedMapStyle,
  unitFitted: FittedProjection,
  needBBox: boolean,
  indices: CellIndices,
  s0: number,
): MapLabelEntry[] {
  const entries: MapLabelEntry[] = [];
  for (const spec of collectMapLabelSpecs(shown, mergedStyle, indices)) {
    const geoCentroid = computeGeoCentroid(spec.feature.geometry);
    if (!geoCentroid) continue;

    const unitAnchor = projectCentroid(geoCentroid, unitFitted);
    const bbox = needBBox
      ? bboxOfScreenRings(projectRings(spec.feature.geometry, unitFitted))
      : undefined;

    entries.push({
      id: spec.id,
      mText: measureMapLabel(
        rc,
        spec.text,
        cellRcd,
        mergedStyle.text.dataLabels,
        spec.dl,
      ),
      dl: spec.dl,
      offset: spec.offset,
      unitAnchor,
      side: unitAnchor.x * s0 + spec.offset.dx <= 0 ? "left" : "right",
      unitBBox: bbox
        ? { w: bbox.maxX - bbox.minX, h: bbox.maxY - bbox.minY }
        : undefined,
    });
  }
  return entries;
}

// The cell's silhouette at unit scale: content half-extents from the FITTING
// features (what the cell frames), band + coastline rings + bbox fallback
// from the SHOWN features (what labels stack against and hug).
export type MapUnitGeometry = {
  contentHalfW: number;
  contentHalfH: number;
  band: { minX: number; minY: number; maxX: number; maxY: number };
  rings: ScreenRings;
};

export function buildMapUnitGeometry(
  shown: ShownMapRegion[],
  unitFitted: FittedProjection,
  contentHalfW: number,
  contentHalfH: number,
): MapUnitGeometry {
  const rings: ScreenRings = [];
  for (const region of shown) {
    rings.push(...projectRings(region.feature.geometry, unitFitted));
  }
  const band = bboxOfScreenRings(rings) ?? {
    minX: -contentHalfW,
    minY: -contentHalfH,
    maxX: contentHalfW,
    maxY: contentHalfH,
  };
  return { contentHalfW, contentHalfH, band, rings };
}

function mapEdgeAtYUnit(
  geom: MapUnitGeometry,
  side: "left" | "right",
  yUnit: number,
): number {
  return intersectScreenRingsAtY(geom.rings, side, yUnit) ??
    (side === "left" ? geom.band.minX : geom.band.maxX);
}

// The driver-geometry hooks at content scale s centred on (cx, cy). centerX
// is the CONTENT centre (plan D7): the old cell-centre split let labels flip
// sides as padding moved the content; on the content centre the split is
// s-invariant, so the solve and the draw agree.
function labelGeometryPartsAt(
  geom: MapUnitGeometry,
  s: number,
  cx: number,
  cy: number,
  calloutMargin: number,
): Pick<
  LabelGeometry,
  "centerX" | "outsideBand" | "outsideEdgeAtY" | "outsideClearance"
> {
  return {
    centerX: cx,
    outsideBand: {
      minY: cy + geom.band.minY * s,
      maxY: cy + geom.band.maxY * s,
    },
    outsideEdgeAtY: (side, y) =>
      cx + mapEdgeAtYUnit(geom, side, (y - cy) / s) * s,
    outsideClearance: calloutMargin,
  };
}

// Places every frozen-outside label at content scale s, through the same
// placeOutsideBoxes core the driver draws with — the reserve IS the draw
// (one placer, plan D1).
export function placeMapOutsideBoxesAt(
  outside: MapLabelEntry[],
  geom: MapUnitGeometry,
  s: number,
  cx: number,
  cy: number,
  gap: number,
  calloutMargin: number,
): OutsidePlacedBox[] {
  return placeOutsideBoxes(
    outside.map((e) => ({
      anchorX: cx + e.unitAnchor.x * s + e.offset.dx,
      anchorY: cy + e.unitAnchor.y * s + e.offset.dy,
      width: e.mText.dims.w(),
      height: e.mText.dims.h(),
      padLeft: e.dl.padding.pl(),
      padRight: e.dl.padding.pr(),
      side: e.side,
    })),
    labelGeometryPartsAt(geom, s, cx, cy, calloutMargin),
    gap,
  );
}

// Union bbox of (content at s) ∪ (outside label boxes at s), outward from the
// content centre — derived from the placer's own output, never re-derived
// alongside it. Halo padding is included unconditionally: the placement
// offset applies it whether or not a halo is drawn.
export function mapExtentsAt(
  outside: MapLabelEntry[],
  geom: MapUnitGeometry,
  s: number,
  gap: number,
  calloutMargin: number,
): DirectionalExtents {
  const boxes = placeMapOutsideBoxesAt(
    outside,
    geom,
    s,
    0,
    0,
    gap,
    calloutMargin,
  );
  let left = geom.contentHalfW * s;
  let right = geom.contentHalfW * s;
  let top = geom.contentHalfH * s;
  let bottom = geom.contentHalfH * s;
  for (let i = 0; i < outside.length; i++) {
    const e = outside[i];
    const box = boxes[i];
    const pad = e.dl.padding;
    const w = e.mText.dims.w();
    const h = e.mText.dims.h();
    left = Math.max(left, -(box.x - pad.pl()));
    right = Math.max(right, box.x + w + pad.pr());
    top = Math.max(top, -(box.y - pad.pt()));
    bottom = Math.max(bottom, box.y + h + pad.pb());
  }
  return { left, right, top, bottom };
}

// Emits the cell's label primitives at the solved (s, cx, cy), honouring the
// frozen s0 placement split carried by id (plan D2).
export function generateResolvedMapLabelPrimitives(
  entries: MapLabelEntry[],
  outsideIds: Set<string>,
  geom: MapUnitGeometry,
  cellRcd: RectCoordsDims,
  s: number,
  cx: number,
  cy: number,
  mergedStyle: MergedMapStyle,
  indices: CellIndices,
): Primitive[] {
  if (entries.length === 0) return [];

  const inside: LabelCandidate[] = [];
  const outside: LabelCandidate[] = [];
  for (const e of entries) {
    const candidate: LabelCandidate = {
      id: e.id,
      mText: e.mText,
      anchor: new Coordinates([
        cx + e.unitAnchor.x * s + e.offset.dx,
        cy + e.unitAnchor.y * s + e.offset.dy,
      ]),
      dataLabel: e.dl,
      outsideSide: e.side,
    };
    (outsideIds.has(e.id) ? outside : inside).push(candidate);
  }

  return generateResolvedFigureLabelPrimitives(
    inside,
    outside,
    {
      cellRcd,
      ...labelGeometryPartsAt(geom, s, cx, cy, mergedStyle.map.calloutMargin),
    },
    mergedStyle.map.labelCollision,
    { keyPrefix: "map-label", ...indices },
  );
}

// The label terms of the autofit floor (plan D4), measured UNWRAPPED
// (maxWidth Infinity) so the floor is exactly proportional to the font scale
// (monotone) and has no cell dependence (no circularity). Budgets every shown
// label as outside: with no cell in existence there is nothing to resolve
// `auto` against, and the conservative side is the only safe one; the draw
// freezes at s0, so floor ≥ draw. Sides split on the unit-anchor x sign,
// which is s-invariant.
export type MapLabelFloorBudget = {
  horizontal: number;
  tallestStack: number;
};

export function calculateMapLabelFloorBudget(
  rc: RenderContext,
  // unitFitted is per cell: under fit "only-regions-in-data" each cell's
  // content centre (and so each label's flank) depends on that cell's data.
  shownPerCell: {
    shown: ShownMapRegion[];
    indices: CellIndices;
    unitFitted: FittedProjection;
  }[],
  mergedStyle: MergedMapStyle,
): MapLabelFloorBudget {
  const mode = toLabelMode(mergedStyle.map.dataLabelMode);
  if (mode === "none" || mode === "inside") {
    return { horizontal: 0, tallestStack: 0 };
  }
  const gap = mergedStyle.map.labelCollision.gap;
  const calloutMargin = mergedStyle.map.calloutMargin;

  let maxLeftW = 0;
  let maxRightW = 0;
  let tallestStack = 0;
  for (const { shown, indices, unitFitted } of shownPerCell) {
    let leftStack = 0;
    let rightStack = 0;
    let nLeft = 0;
    let nRight = 0;
    for (const spec of collectMapLabelSpecs(shown, mergedStyle, indices)) {
      const geoCentroid = computeGeoCentroid(spec.feature.geometry);
      if (!geoCentroid) continue;
      const unitAnchor = projectCentroid(geoCentroid, unitFitted);
      const mText = rc.mText(
        spec.text,
        buildDataLabelTextStyle(mergedStyle.text.dataLabels, spec.dl),
        Infinity,
      );
      const pad = spec.dl.padding;
      const w = mText.dims.w() + pad.pl() + pad.pr();
      const h = mText.dims.h();
      if (unitAnchor.x <= 0) {
        maxLeftW = Math.max(maxLeftW, w);
        leftStack += h;
        nLeft++;
      } else {
        maxRightW = Math.max(maxRightW, w);
        rightStack += h;
        nRight++;
      }
    }
    tallestStack = Math.max(
      tallestStack,
      leftStack + Math.max(0, nLeft - 1) * gap,
      rightStack + Math.max(0, nRight - 1) * gap,
    );
  }

  const horizontal = (maxLeftW > 0 ? calloutMargin + maxLeftW : 0) +
    (maxRightW > 0 ? calloutMargin + maxRightW : 0);
  return { horizontal, tallestStack };
}
