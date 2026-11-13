// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinLabelSubChartExtent,
  type ContentScaleResult,
  CustomFigureStyle,
  getSubChartMembers,
  isAutoScaleLegendConfig,
  measureChart,
  type MergedMapStyle,
  type OutsideLabelPlacement,
  type PaneGrid,
  type Primitive,
  type RectCoordsDims,
  type RenderContext,
  resolveAutoScaleLegend,
  resolveFlooredContentScale,
  resolveLabelPlacement,
  type SimplifiedChartConfig,
  solveContentScale,
  type SubChartMembers,
} from "../deps.ts";
import { getMapDataTransformed } from "../get_map_data.ts";
import type { MapDataTransformed, MapInputs, MeasuredMap } from "../types.ts";
import {
  generateMapAreaPrimitives,
  resolveShownMapAreas,
  type ShownMapArea,
} from "./generate_map_area_primitives.ts";
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
import { getFeatureMatchKey, toLabelMode } from "./label_shared.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";

export function measureMap(
  rc: RenderContext,
  bounds: RectCoordsDims,
  inputs: MapInputs,
  paneGrid: PaneGrid,
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
    dataDimensions: {
      pane: transformedData.pane,
      tier: transformedData.tier,
      lane: transformedData.lane,
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
    paneGrid,
  };

  const chartMeasured = measureChart(
    rc,
    bounds,
    inputs,
    config,
    fitScale,
  );

  const projectionFn = getProjectionFn(mergedStyle.map.projection);

  // Two-phase over the figure: solve every sub-chart's content scale
  // first, then emit every sub-chart at the minimum, so small multiples stay
  // comparable.
  const solved: SolvedMapSubChart[] = [];
  for (const prim of chartMeasured.primitives) {
    if (prim.type !== "chart-grid") continue;
    solved.push(
      solveMapSubChart(
        rc,
        prim.bounds,
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
      ...emitMapSubChart(c, mergedStyle, projectionFn, commonS),
    );
  }

  const starved = solvable.some((c) => c.starved);

  return {
    ...chartMeasured,
    primitives: [...chartMeasured.primitives, ...mapPrimitives],
    cramped: starved || chartMeasured.cramped,
  };
}

type SubChartIndices = {
  i_pane: number;
  i_tier: number;
  i_lane: number;
};

type SolvedMapSubChart = {
  indices: SubChartIndices;
  members: SubChartMembers;
  subChartRcd: RectCoordsDims;
  featuresForFitting: GeoJSONFeature[];
  shown: ShownMapArea[];
  unitGeom: MapUnitGeometry | undefined;
  entries: MapLabelEntry[];
  // The frozen s0 placement split, carried by id.
  outsideIds: Set<string>;
  outside: MapLabelEntry[];
  // Which placer this sub-chart solved under. The final choice is re-made at the
  // harmonised scale in emitMapSubChart; this is the solve's own answer.
  placement: OutsideLabelPlacement;
  // The field's reference scale and validity margin, fixed per sub-chart so one
  // distance field serves every trial content scale.
  trackCtx: MapTrackContext;
  // This sub-chart's own solved content scale; emission uses the figure minimum.
  s: number;
  // The budget was infeasible even at the legibility floor.
  starved: boolean;
  // Empty/point geometry: nothing to scale, constant-centre projector.
  degenerate: boolean;
};

export function featuresForFit(
  geoFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  mapAreaMatchProp: string,
  fit: "all-map-areas" | "only-map-areas-in-data",
): GeoJSONFeature[] {
  return fit === "only-map-areas-in-data"
    ? geoFeatures.filter(
      (f) => getFeatureMatchKey(f, mapAreaMatchProp) in valueMap,
    )
    : geoFeatures;
}

function solveMapSubChart(
  rc: RenderContext,
  subChartRcd: RectCoordsDims,
  indices: SubChartIndices,
  data: MapDataTransformed,
  mergedStyle: MergedMapStyle,
  projectionFn: ProjectionFn,
): SolvedMapSubChart {
  const { i_pane, i_tier, i_lane } = indices;
  const mode = toLabelMode(mergedStyle.map.dataLabelMode);
  const valueMap = data.valueMaps[i_pane][i_tier][i_lane];
  const members = getSubChartMembers(data, indices);

  const featuresForFitting = featuresForFit(
    data.geoFeatures,
    valueMap,
    data.mapArea.matchProp,
    mergedStyle.map.fit,
  );
  const shown = resolveShownMapAreas(
    data.geoFeatures,
    valueMap,
    data.valueRange,
    data,
    mergedStyle.content.mapAreas.getStyle,
    i_pane,
    i_tier,
    i_lane,
    members,
  );

  const projBounds = computeProjectedBounds(featuresForFitting, projectionFn);
  if (!projBounds || projBounds.w === 0 || projBounds.h === 0) {
    return {
      indices,
      members,
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
  // Placement is decided once, at s0, and never re-decided.
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
      members,
      s0,
    );
    entries = entries.map((e) => {
      const { placement, mText } = resolveLabelPlacement(
        mode,
        e.fitsInside,
        e.mText,
        {
          // The fit ladder, switched on for map. Text measurement depends
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
      // then drawn as one long line overflows the map area it was kept inside.
      return mText === e.mText ? e : { ...e, mText };
    });
    outside = entries.filter((e) => outsideIds.has(e.id));
  }

  // Solve for the content scale the frozen label set affords. The
  // floor puts the LARGER drawn dimension at the legibility extent, matching
  // the old 42×42 minimum sub-chart.
  let placement = mergedStyle.map.outsideLabelPlacement;
  const sFloor =
    calculateMinLabelSubChartExtent(rc, mergedStyle.text.dataLabels) /
    Math.max(projBounds.w, projBounds.h);
  // The field is built once per sub-chart at s0 and reused at every trial scale, so
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
      // a genuine "does not fit"; only when NO scale works does the sub-chart fall
      // back.
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
      // N10: this sub-chart cannot be nearest-point at any scale, so it re-solves on
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
    members,
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

function emitMapSubChart(
  solvedSubChart: SolvedMapSubChart,
  mergedStyle: MergedMapStyle,
  projectionFn: ProjectionFn,
  s: number,
): Primitive[] {
  const {
    indices,
    members,
    subChartRcd,
    featuresForFitting,
    shown,
    unitGeom,
    entries,
    outsideIds,
    outside,
    trackCtx,
    degenerate,
  } = solvedSubChart;

  if (degenerate || !unitGeom || s <= 0) {
    const fitted = fitProjectionAtScale(
      featuresForFitting,
      projectionFn,
      0,
      subChartRcd.centerX(),
      subChartRcd.centerY(),
    );
    return generateMapAreaPrimitives(shown, fitted, indices, members);
  }

  // Centre the union bbox in the sub-chart — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  // N10: the final nearest-vs-flank choice is made ONCE, here, at the harmonised
  // figure-minimum scale — a track feasible at this sub-chart's own solved s can be
  // infeasible at a smaller one, and the centring extents and the emitted
  // primitives must not disagree about which placer ran.
  let placement = solvedSubChart.placement;
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

  const primitives: Primitive[] = generateMapAreaPrimitives(
    shown,
    fitted,
    indices,
    members,
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
      members,
      placement,
      trackCtx,
    ),
  );

  return primitives;
}
