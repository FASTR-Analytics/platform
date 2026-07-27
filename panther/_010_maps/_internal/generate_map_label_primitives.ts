// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DirectionalExtents,
  DistanceField,
  LabelCandidate,
  LabelGeometry,
  LabelMode,
  LabelTrack,
  MergedMapStyle,
  OutsideLabelPlacement,
  Primitive,
  RectCoordsDims,
  RenderContext,
  Ring,
} from "../deps.ts";
import {
  buildDataLabelTextStyle,
  buildDistanceField,
  Coordinates,
  fieldTrack,
  generateResolvedFigureLabelPrimitives,
  placeNearestBoxes,
  placeOutsideBoxes,
  scaledTrack,
} from "../deps.ts";
import type { FittedProjection } from "./fit_projection.ts";
import {
  bboxOfScreenRings,
  computeGeoCentroid,
  computeRegionPole,
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
  // The label's own words, so the I3 ladder can re-wrap them at a trial width.
  text: string;
  mText: LabelCandidate["mText"];
  dl: LabelCandidate["dataLabel"];
  offset: { dx: number; dy: number };
  unitAnchor: { x: number; y: number };
  // The flank, frozen at s0 alongside the placement split: centroidOffset.dx
  // is in screen DU while unitAnchor.x scales with s, so the anchor-vs-centre
  // sign can vary with s — one decision, in one frame, used by solve and
  // emission alike (adversarial review F1).
  side: "left" | "right";
  // Does a w x h box fit inside this region, in screen DU at s0? Present only
  // in "auto" mode, where the placement split is decided; absent everywhere
  // else because the verdict is already known.
  fitsInside?: (w: number, h: number) => boolean;
};

export function buildMapLabelEntries(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  shown: ShownMapRegion[],
  mergedStyle: MergedMapStyle,
  unitFitted: FittedProjection,
  mode: Exclude<LabelMode, "none">,
  indices: CellIndices,
  s0: number,
): MapLabelEntry[] {
  const entries: MapLabelEntry[] = [];
  for (const spec of collectMapLabelSpecs(shown, mergedStyle, indices)) {
    // `dataLabelMode: "centroid"` names an anchor RULE and is explicitly out of
    // scope: it keeps the area-weighted centroid it asked for. Every other mode
    // takes the pole of inaccessibility, which is inside its own region even
    // when the centroid is not (plan I2).
    const pole = mode === "inside"
      ? undefined
      : computeRegionPole(projectRings(spec.feature.geometry, unitFitted));
    const geoCentroid = computeGeoCentroid(spec.feature.geometry);
    const unitAnchor = pole?.point ??
      (geoCentroid ? projectCentroid(geoCentroid, unitFitted) : undefined);
    if (!unitAnchor) continue;

    entries.push({
      id: spec.id,
      text: spec.text,
      mText: measureMapLabel(
        rc,
        spec.text,
        cellRcd,
        mergedStyle.text.dataLabels,
        spec.dl,
        mergedStyle.map.labelWrapFraction,
      ),
      dl: spec.dl,
      offset: spec.offset,
      unitAnchor,
      side: unitAnchor.x * s0 + spec.offset.dx <= 0 ? "left" : "right",
      fitsInside: mode === "auto" && pole
        ? (w, h) => pole.fitsBox(w / s0, h / s0)
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
  // The signed distance field of the shown silhouette, built lazily and at most
  // ONCE per cell (the EDT is ~50ms; extracting a level set from it is ~18ms).
  //
  // Deliberately NOT at unit scale, despite everything else here being: unit
  // coordinates span a fraction of a DU, so a 1 DU raster pitch there would
  // give a 2x2 grid. It is built at a reference scale the caller names, and
  // because distances are affine in the content scale one field then answers
  // for every trial scale — see scaledTrack.
  fieldAt: (
    refScale: number,
    margin: number,
    exactBandFor: (refScale: number) => number,
  ) => DistanceField;
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

  let cached: { key: string; field: DistanceField } | undefined;
  const fieldAt = (
    refScale: number,
    margin: number,
    exactBandFor: (refScale: number) => number,
  ): DistanceField => {
    const key = `${refScale}/${margin}`;
    if (cached?.key === key) return cached.field;
    const scaled: Ring[] = rings.map((ring) =>
      ring.map(([x, y]) => ({ x: x * refScale, y: y * refScale }))
    );
    const field = buildDistanceField(scaled, {
      pitch: FIELD_PITCH_DU,
      margin,
      // Exactness is needed across the band the track and the floor test read,
      // which is the clearance — NOT across the whole grid margin, which is
      // sized for the smallest content scale the solve might reach. Tying them
      // together costs ~8us per query instead of ~0.05us, over millions of
      // queries. Three clearances covers every trial scale down to a third of
      // the reference one; below that the raster's ~1 DU answers, which is
      // what the polyline's own tolerance already is.
      exactBand: exactBandFor(refScale),
    });
    cached = { key, field };
    return field;
  };

  return { contentHalfW, contentHalfH, band, rings, fieldAt };
}

// How many clearances out the field answers exactly. See the call site.
const EXACT_BAND_CLEARANCES = 3;

// Plan-ruled: 1 DU. In-band accuracy is pitch-independent (every query the band
// placement reads is answered exactly against the real segments), so the pitch
// only bounds the deep-interior maximum, which feeds inside capacity where half
// a DU is irrelevant. 1 halves the build cost against 0.5.
const FIELD_PITCH_DU = 1;

// The track at content scale s, centred at (cx, cy), or undefined when the
// silhouette has no extractable level set at all. `refScale` names the scale
// the field was built at; the level extracted is the clearance measured in that
// field's own units, and scaledTrack maps the result back out.
function mapTrackAt(
  geom: MapUnitGeometry,
  refScale: number,
  fieldMargin: number,
  s: number,
  cx: number,
  cy: number,
  calloutMargin: number,
): LabelTrack | undefined {
  if (!(s > 0) || !(refScale > 0)) return undefined;
  const field = geom.fieldAt(
    refScale,
    fieldMargin,
    (r) => EXACT_BAND_CLEARANCES * calloutMargin * r / refScale,
  );
  const inner = fieldTrack(field, (calloutMargin * refScale) / s);
  if (inner.components.length === 0) return undefined;
  return scaledTrack(inner, s / refScale, cx, cy);
}

// How far beyond the silhouette the field must stay VALID, in the field's own
// units (screen DU at refScale). The field must be accurate across the band the
// track and the floor test read — the silhouette out to the clearance — and
// that band is widest, relative to the shrinking silhouette, at the smallest
// content scale the solve will try.
//
// It deliberately does NOT budget for the reach of a whole label box. Outside
// the grid the field clamps to its edge value, which UNDERSTATES the clearance
// there (the true distance only grows), so a box hanging past the grid is
// judged as closer to the shape than it is. That direction is safe: it can cost
// a placement, never authorise a bad one. Budgeting for it instead would scale
// the grid with the longest label and is what makes this affordable.
export function mapFieldMargin(
  calloutMargin: number,
  refScale: number,
  sMin: number,
): number {
  const bandInFieldUnits = (calloutMargin * refScale) /
    Math.max(sMin, 1e-9);
  return bandInFieldUnits + 4 * FIELD_PITCH_DU;
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

// Always, and it is the map that has the problem: a region's anchor sits at an
// arbitrary interior point rather than on the silhouette directly inward of its
// own label, so two labels can be in the correct TRACK order with crossing
// leaders (plan step 10). A pie cannot be in that position and must never be
// re-ordered — see PIE_UNTANGLES_LEADERS. Not a style option: the owner ruled
// this per figure type, not per user.
const MAP_UNTANGLES_LEADERS = true;

// Map's driver-geometry hooks, with the nearest-point track attached when that
// is the policy for this cell. outsideEdgeAtY stays wired either way — it is
// the FLANK path's coastline ray-cast, and flank is the fallback.
export function buildMapLabelGeometry(
  geom: MapUnitGeometry,
  cellRcd: RectCoordsDims,
  s: number,
  cx: number,
  cy: number,
  mergedStyle: MergedMapStyle,
  placement: OutsideLabelPlacement,
  ctx: MapTrackContext,
): LabelGeometry {
  const calloutMargin = mergedStyle.map.calloutMargin;
  const track = placement === "nearest"
    ? mapTrackAt(geom, ctx.refScale, ctx.fieldMargin, s, cx, cy, calloutMargin)
    : undefined;
  return {
    cellRcd,
    ...labelGeometryPartsAt(geom, s, cx, cy, calloutMargin),
    outsideTrack: track
      ? {
        track,
        clearanceFloor: mergedStyle.map.labelClearanceFloor,
        alignmentSwitchAngleDeg: mergedStyle.map.labelAlignmentSwitchAngle,
        untangleLeaders: MAP_UNTANGLES_LEADERS,
      }
      : undefined,
  };
}

// Everything a nearest-point map placement needs that varies per cell rather
// than per trial scale: the field's reference scale and how far it stays valid.
export type MapTrackContext = {
  refScale: number;
  fieldMargin: number;
};

// Top-left of one label's TEXT box — all the extents pass needs, and the one
// shape both placers can state.
export type MapOutsideBox = { x: number; y: number };

// Places every frozen-outside label at content scale s, through the same placer
// core the driver draws with — the reserve IS the draw (one placer, plan D1).
//
// Undefined only under "nearest", and only when the track at this s cannot hold
// the labels: the N10 fallback signal, not an error.
export function placeMapOutsideBoxesAt(
  outside: MapLabelEntry[],
  geom: MapUnitGeometry,
  s: number,
  cx: number,
  cy: number,
  mergedStyle: MergedMapStyle,
  placement: OutsideLabelPlacement,
  ctx: MapTrackContext,
): MapOutsideBox[] | undefined {
  const gap = mergedStyle.map.labelCollision.gap;
  const calloutMargin = mergedStyle.map.calloutMargin;
  const anchorOf = (e: MapLabelEntry) => ({
    x: cx + e.unitAnchor.x * s + e.offset.dx,
    y: cy + e.unitAnchor.y * s + e.offset.dy,
  });

  if (placement === "nearest") {
    const track = mapTrackAt(
      geom,
      ctx.refScale,
      ctx.fieldMargin,
      s,
      cx,
      cy,
      calloutMargin,
    );
    if (!track) return undefined;
    const nearest = placeNearestBoxes(
      outside.map((e) => ({
        anchor: anchorOf(e),
        width: e.mText.dims.w(),
        height: e.mText.dims.h(),
        padLeft: e.dl.padding.pl(),
        padRight: e.dl.padding.pr(),
        padTop: e.dl.padding.pt(),
        padBottom: e.dl.padding.pb(),
      })),
      track,
      {
        gap,
        clearance: calloutMargin,
        clearanceFloor: mergedStyle.map.labelClearanceFloor,
        alignmentSwitchAngleDeg: mergedStyle.map.labelAlignmentSwitchAngle,
        untangleLeaders: MAP_UNTANGLES_LEADERS,
      },
    );
    if (nearest.kind !== "ok") return undefined;
    return nearest.boxes.map((box, i) => {
      const w = outside[i].mText.dims.w();
      const h = outside[i].mText.dims.h();
      return {
        x: box.align.h === "left"
          ? box.position.x
          : box.align.h === "right"
          ? box.position.x - w
          : box.position.x - w / 2,
        y: box.position.y - h / 2,
      };
    });
  }

  return placeOutsideBoxes(
    outside.map((e) => {
      const anchor = anchorOf(e);
      return {
        anchorX: anchor.x,
        anchorY: anchor.y,
        width: e.mText.dims.w(),
        height: e.mText.dims.h(),
        padLeft: e.dl.padding.pl(),
        padRight: e.dl.padding.pr(),
        side: e.side,
      };
    }),
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
  mergedStyle: MergedMapStyle,
  placement: OutsideLabelPlacement,
  ctx: MapTrackContext,
): DirectionalExtents | undefined {
  const boxes = placeMapOutsideBoxesAt(
    outside,
    geom,
    s,
    0,
    0,
    mergedStyle,
    placement,
    ctx,
  );
  if (!boxes) return undefined;
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
  placement: OutsideLabelPlacement,
  ctx: MapTrackContext,
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
    buildMapLabelGeometry(
      geom,
      cellRcd,
      s,
      cx,
      cy,
      mergedStyle,
      placement,
      ctx,
    ),
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
  // Extra width beyond the content that outside labels demand.
  horizontal: number;
  // Extra height. What this MEANS differs by placer, and so does how the
  // consumer combines it (plan N9): under flank it is the tallest single-flank
  // stack, which the cell must be at least as tall as; under nearest labels sit
  // above and below the content too, so the demand is ADDITIVE.
  vertical: number;
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
    return { horizontal: 0, vertical: 0 };
  }
  const gap = mergedStyle.map.labelCollision.gap;
  const calloutMargin = mergedStyle.map.calloutMargin;
  const nearest = mergedStyle.map.outsideLabelPlacement === "nearest";

  let maxLeftW = 0;
  let maxRightW = 0;
  let tallestStack = 0;
  // Nearest-point labels can land on any side, so the floor is side-blind: the
  // widest and the tallest label, budgeted on both sides. Still unwrapped,
  // still monotone in the font scale, still free of any cell dependence.
  let maxW = 0;
  let maxH = 0;
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
      maxW = Math.max(maxW, w);
      maxH = Math.max(maxH, h + pad.pt() + pad.pb());
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
  if (!nearest || maxW === 0) return { horizontal, vertical: tallestStack };

  // Under nearest the floor must cover BOTH placers, because any cell may fall
  // back to flank (N10) and the floor is what autofit shrinks the type against.
  // Budgeting nearest alone is how a 47-label map starved: the floor asked for
  // 94 DU of height, nothing was shrunk, the cell then fell back to flank and
  // needed 612 with full-size type. "Floor >= draw" is the property that makes
  // a floor a floor, and a fallback is part of the draw.
  return {
    horizontal: Math.max(horizontal, 2 * (calloutMargin + maxW)),
    vertical: Math.max(tallestStack, 2 * (calloutMargin + maxH)),
  };
}
