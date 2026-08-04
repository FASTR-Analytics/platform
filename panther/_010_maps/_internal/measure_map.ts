// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinLabelPlotExtent,
  type ContentScaleResult,
  CustomFigureStyle,
  isAutoScaleLegendConfig,
  measureChart,
  type MergedMapStyle,
  type OutsideLabelPlacement,
  type Primitive,
  type RectCoordsDims,
  type RenderContext,
  resolveAutoScaleLegend,
  resolveFlooredContentScale,
  resolveLabelPlacement,
  type SimplifiedChartConfig,
  solveContentScale,
} from "../deps.ts";
import { getMapDataTransformed } from "../get_map_data.ts";
import type { MapDataTransformed, MapInputs, MeasuredMap } from "../types.ts";
import {
  generateMapRegionPrimitives,
  resolveShownRegions,
  type ShownMapRegion,
} from "./generate_map_region_primitives.ts";
import {
  buildMapLabelEntries,
  buildMapUnitGeometry,
  generateResolvedMapLabelPrimitives,
  mapExtentsAt,
  mapFieldMargin,
  type MapLabelEntry,
  type MapTrackContext,
  type MapUnitGeometry,
} from "./generate_map_label_primitives.ts";
import {
  computeProjectedBounds,
  fitProjectionAtScale,
} from "./fit_projection.ts";
import { getProjectionFn, type ProjectionFn } from "./projections.ts";
import {
  getFeatureMatchKey,
  getMapCellHeaders,
  toLabelMode,
} from "./label_shared.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";

export function measureMap(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: MapInputs,
  fitScale?: number,
): MeasuredMap {
  const customFigureStyle = new CustomFigureStyle(
    inputs.style,
    fitScale,
  );
  const mergedStyle = customFigureStyle.getMergedMapStyle();
  const transformedData = getMapDataTransformed(inputs.data);

  const config: SimplifiedChartConfig<
    MapInputs,
    MapDataTransformed,
    MergedMapStyle
  > = {
    mergedStyle,
    transformedData,
    dataProps: {
      paneHeaders: transformedData.paneHeaders,
      tierHeaders: transformedData.tierHeaders,
      laneHeaders: transformedData.laneHeaders,
      seriesHeaders: [],
    },
    xAxisConfig: { type: "none" },
    yAxisConfig: { type: "none" },
    orientation: "vertical",
    resolvedLegend: isAutoScaleLegendConfig(inputs.legend)
      ? resolveAutoScaleLegend(
        inputs.legend,
        customFigureStyle.getValuesColorFunc(),
        transformedData.valueRange,
      )
      : undefined,
  };

  const chartMeasured = measureChart(
    rc,
    bounds,
    inputs,
    config,
    fitScale,
  );

  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  // Two-phase over the grid (plan D5): solve every cell's content scale
  // first, then emit every cell at the minimum, so small multiples stay
  // comparable.
  const solved: SolvedMapCell[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type !== "chart-grid") continue;
    solved.push(
      solveMapCell(
        rc,
        prim.plotAreaRcd,
        prim.meta,
        transformedData,
        mergedStyle,
        projectionFn,
      ),
    );
  }

  const solvable = solved.filter((c) => !c.degenerate);
  const commonS = solvable.length > 0
    ? Math.min(...solvable.map((c) => c.s))
    : 0;

  const mapPrimitives: Primitive[] = [];
  for (const c of solved) {
    mapPrimitives.push(
      ...emitMapCell(c, mergedStyle, projectionFn, commonS),
    );
  }

  const starved = solvable.some((c) => c.starved);

  return {
    ...chartMeasured,
    primitives: [...chartMeasured.primitives, ...mapPrimitives],
    cramped: starved || chartMeasured.cramped,
  };
}

type CellIndices = {
  paneIndex: number;
  tierIndex: number;
  laneIndex: number;
};

type SolvedMapCell = {
  indices: CellIndices;
  subChartRcd: RectCoordsDims;
  featuresForFitting: GeoJSONFeature[];
  shown: ShownMapRegion[];
  unitGeom: MapUnitGeometry | undefined;
  entries: MapLabelEntry[];
  // The frozen s0 placement split (plan D2), carried by id.
  outsideIds: Set<string>;
  outside: MapLabelEntry[];
  // Which placer this cell solved under. The final choice is re-made at the
  // harmonised scale in emitOneCell (N10); this is the solve's own answer.
  placement: OutsideLabelPlacement;
  // The field's reference scale and validity margin, fixed per cell so one
  // distance field serves every trial content scale.
  trackCtx: MapTrackContext;
  // This cell's own solved content scale; emission uses the grid minimum.
  s: number;
  // The budget was infeasible even at the legibility floor (plan D6).
  starved: boolean;
  // Empty/point geometry: nothing to scale, constant-centre projector.
  degenerate: boolean;
};

export function featuresForFit(
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  areaMatchProp: string,
  fit: "all-regions" | "only-regions-in-data",
): GeoJSONFeature[] {
  return fit === "only-regions-in-data"
    ? geoFeatures.filter(
      (f) => getFeatureMatchKey(f, areaMatchProp) in valueMap,
    )
    : geoFeatures;
}

function solveMapCell(
  rc: RenderContext,
  subChartRcd: RectCoordsDims,
  indices: CellIndices,
  data: MapDataTransformed,
  mergedStyle: MergedMapStyle,
  projectionFn: ProjectionFn,
): SolvedMapCell {
  const { paneIndex, tierIndex, laneIndex } = indices;
  const mode = toLabelMode(mergedStyle.map.dataLabelMode);
  const valueMap = data.valueMaps[paneIndex][tierIndex][laneIndex];
  const headers = getMapCellHeaders(data, indices);

  const featuresForFitting = featuresForFit(
    data.geoFeatures,
    valueMap,
    data.areaMatchProp,
    mergedStyle.map.fit,
  );
  const shown = resolveShownRegions(
    data.geoFeatures,
    valueMap,
    data.valueRange,
    data.areaMatchProp,
    mergedStyle.content.mapRegions.getStyle,
    paneIndex,
    tierIndex,
    laneIndex,
    headers,
  );

  const projBounds = computeProjectedBounds(featuresForFitting, projectionFn);
  if (!projBounds || projBounds.w === 0 || projBounds.h === 0) {
    return {
      indices,
      subChartRcd,
      featuresForFitting,
      shown,
      unitGeom: undefined,
      entries: [],
      outsideIds: new Set(),
      outside: [],
      placement: mergedStyle.map.outsideLabelPlacement,
      trackCtx: { refScale: 1, fieldMargin: 0 },
      s: 0,
      starved: false,
      degenerate: true,
    };
  }

  // s0: the label-free content scale — the zero-padding projection fit.
  // Placement is decided once, at s0, and never re-decided (plan D2).
  const s0 = Math.min(
    subChartRcd.w() / projBounds.w,
    subChartRcd.h() / projBounds.h,
  );

  const unitFitted = fitProjectionAtScale(
    featuresForFitting,
    projectionFn,
    1,
    0,
    0,
  );
  const unitGeom = buildMapUnitGeometry(
    shown,
    unitFitted,
    projBounds.w / 2,
    projBounds.h / 2,
  );

  const outsideIds = new Set<string>();
  let entries: MapLabelEntry[] = [];
  let outside: MapLabelEntry[] = [];
  if (mode !== "none") {
    entries = buildMapLabelEntries(
      rc,
      subChartRcd,
      shown,
      mergedStyle,
      unitFitted,
      mode,
      indices,
      headers,
      s0,
    );
    entries = entries.map((e) => {
      const { placement, mText } = resolveLabelPlacement(
        mode,
        e.fitsInside,
        e.mText,
        {
          // The I3 fit ladder, switched on for map. Text measurement depends
          // only on the type style and the wrap width, never on the content
          // scale, so a rung's wrapping decided here at s0 is still valid at
          // the emission scale.
          measureAt: (wrapWidth) => rc.mText(e.text, e.mText.ti, wrapWidth),
          maxLines: mergedStyle.map.maxLabelLines,
          insideFitFraction: mergedStyle.map.insideFitFraction,
        },
      );
      if (placement === "outside") {
        outsideIds.add(e.id);
      }
      // A rung may have re-wrapped the text to earn its verdict, and the
      // emitter must draw what was tested: a label rescued onto two lines and
      // then drawn as one long line overflows the region it was kept inside.
      return mText === e.mText ? e : { ...e, mText };
    });
    outside = entries.filter((e) => outsideIds.has(e.id));
  }

  // Solve for the content scale the frozen label set affords (plan D3). The
  // floor puts the LARGER drawn dimension at the legibility extent, matching
  // the old 42×42 minimum cell.
  let placement = mergedStyle.map.outsideLabelPlacement;
  const sFloor = calculateMinLabelPlotExtent(rc, mergedStyle.text.dataLabels) /
    Math.max(projBounds.w, projBounds.h);
  // The field is built once per cell at s0 and reused at every trial scale, so
  // its validity margin has to cover the smallest scale the solve will reach.
  const trackCtx: MapTrackContext = {
    refScale: s0,
    fieldMargin: mapFieldMargin(mergedStyle.map.calloutMargin, s0, sFloor),
  };
  let result: ContentScaleResult | undefined;
  if (outside.length > 0) {
    const fitsUnder = (p: OutsideLabelPlacement) => (trialS: number) => {
      const e = mapExtentsAt(
        outside,
        unitGeom,
        trialS,
        mergedStyle,
        p,
        trackCtx,
      );
      // Undefined = the track cannot hold these labels at this scale, which is
      // a genuine "does not fit"; only when NO scale works does the cell fall
      // back (N10).
      return e !== undefined &&
        e.left + e.right <= subChartRcd.w() &&
        e.top + e.bottom <= subChartRcd.h();
    };
    // A track that cannot hold these labels at the LARGEST scale cannot hold
    // them at any smaller one — the track only gets shorter while the labels
    // stay the same size. So one placement attempt at s0 rules out the whole
    // scan, which on a 47-label adm1 map is the difference between one track
    // extraction and sixty-five.
    if (
      placement === "nearest" &&
      !mapExtentsAt(outside, unitGeom, s0, mergedStyle, "nearest", trackCtx)
    ) {
      placement = "flank";
    }
    result = solveContentScale(fitsUnder(placement), sFloor, s0);
    if (result.kind === "infeasible" && placement === "nearest") {
      // N10: this cell cannot be nearest-point at any scale, so it re-solves on
      // the flank placer — all shipped machinery — and is NOT cramped for that
      // reason. Flank fitting is a success.
      placement = "flank";
      result = solveContentScale(fitsUnder("flank"), sFloor, s0);
    }
  }

  // BOTH paths — labelled and unlabelled — go through the shared clamp, the
  // same chokepoint pie uses, so the two figures cannot drift on the rule: an
  // unlabelled map is still floored, and an infeasible budget draws at the
  // floor anyway (legibility beats frame). A floor-lifted scale (s > s0)
  // overflows the sub-chart and is reported as cramped, never clipped
  // silently.
  const resolved = resolveFlooredContentScale({ s0, sFloor, solved: result });
  const s = resolved.s;
  const starved = resolved.starved || s > s0;

  return {
    indices,
    subChartRcd,
    featuresForFitting,
    shown,
    unitGeom,
    entries,
    outsideIds,
    outside,
    placement,
    trackCtx,
    s,
    starved,
    degenerate: false,
  };
}

function emitMapCell(
  solvedCell: SolvedMapCell,
  mergedStyle: MergedMapStyle,
  projectionFn: ProjectionFn,
  s: number,
): Primitive[] {
  const {
    indices,
    subChartRcd,
    featuresForFitting,
    shown,
    unitGeom,
    entries,
    outsideIds,
    outside,
    trackCtx,
    degenerate,
  } = solvedCell;
  const { paneIndex, tierIndex, laneIndex } = indices;

  if (degenerate || !unitGeom || s <= 0) {
    const fitted = fitProjectionAtScale(
      featuresForFitting,
      projectionFn,
      0,
      subChartRcd.centerX(),
      subChartRcd.centerY(),
    );
    return generateMapRegionPrimitives(
      subChartRcd,
      shown,
      fitted,
      paneIndex,
      tierIndex,
      laneIndex,
    );
  }

  // Centre the union bbox in the cell — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  // N10: the final nearest-vs-flank choice is made ONCE, here, at the harmonised
  // grid-minimum scale — a track feasible at this cell's own solved s can be
  // infeasible at a smaller one, and the centring extents and the emitted
  // primitives must not disagree about which placer ran.
  let placement = solvedCell.placement;
  let extents = outside.length > 0
    ? mapExtentsAt(outside, unitGeom, s, mergedStyle, placement, trackCtx)
    : undefined;
  if (outside.length > 0 && !extents && placement === "nearest") {
    placement = "flank";
    extents = mapExtentsAt(
      outside,
      unitGeom,
      s,
      mergedStyle,
      "flank",
      trackCtx,
    );
  }

  let cx = subChartRcd.centerX();
  let cy = subChartRcd.centerY();
  if (extents) {
    cx = subChartRcd.x() +
      (subChartRcd.w() - (extents.left + extents.right)) / 2 +
      extents.left;
    cy = subChartRcd.y() +
      (subChartRcd.h() - (extents.top + extents.bottom)) / 2 +
      extents.top;
  }

  const fitted = fitProjectionAtScale(
    featuresForFitting,
    projectionFn,
    s,
    cx,
    cy,
  );

  const primitives: Primitive[] = generateMapRegionPrimitives(
    subChartRcd,
    shown,
    fitted,
    paneIndex,
    tierIndex,
    laneIndex,
  );

  primitives.push(
    ...generateResolvedMapLabelPrimitives(
      entries,
      outsideIds,
      unitGeom,
      subChartRcd,
      s,
      cx,
      cy,
      mergedStyle,
      indices,
      placement,
      trackCtx,
    ),
  );

  return primitives;
}
