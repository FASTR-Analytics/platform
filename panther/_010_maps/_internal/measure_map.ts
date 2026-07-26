// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  calculateMinLabelPlotExtent,
  CustomFigureStyle,
  isAutoScaleLegendConfig,
  measureChart,
  type MergedMapStyle,
  type Primitive,
  type RectCoordsDims,
  type RenderContext,
  resolveAutoScaleLegend,
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
  type MapLabelEntry,
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
  cellRcd: RectCoordsDims;
  featuresForFitting: GeoJSONFeature[];
  shown: ShownMapRegion[];
  unitGeom: MapUnitGeometry | undefined;
  entries: MapLabelEntry[];
  // The frozen s0 placement split (plan D2), carried by id.
  outsideIds: Set<string>;
  outside: MapLabelEntry[];
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
  cellRcd: RectCoordsDims,
  indices: CellIndices,
  data: MapDataTransformed,
  mergedStyle: MergedMapStyle,
  projectionFn: ProjectionFn,
): SolvedMapCell {
  const { paneIndex, tierIndex, laneIndex } = indices;
  const mode = toLabelMode(mergedStyle.map.dataLabelMode);
  const gap = mergedStyle.map.labelCollision.gap;
  const valueMap = data.valueMaps[paneIndex][tierIndex][laneIndex];

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
  );

  const projBounds = computeProjectedBounds(featuresForFitting, projectionFn);
  if (!projBounds || projBounds.w === 0 || projBounds.h === 0) {
    return {
      indices,
      cellRcd,
      featuresForFitting,
      shown,
      unitGeom: undefined,
      entries: [],
      outsideIds: new Set(),
      outside: [],
      s: 0,
      starved: false,
      degenerate: true,
    };
  }

  // s0: the label-free content scale — the zero-padding projection fit.
  // Placement is decided once, at s0, and never re-decided (plan D2).
  const s0 = Math.min(
    cellRcd.w() / projBounds.w,
    cellRcd.h() / projBounds.h,
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
      cellRcd,
      shown,
      mergedStyle,
      unitFitted,
      mode === "auto",
      indices,
      s0,
    );
    for (const e of entries) {
      const placement = resolveLabelPlacement(
        mode,
        e.unitBBox ? { w: e.unitBBox.w * s0, h: e.unitBBox.h * s0 } : undefined,
        e.mText,
      );
      if (placement === "outside") {
        outsideIds.add(e.id);
      }
    }
    outside = entries.filter((e) => outsideIds.has(e.id));
  }

  // Solve for the content scale the frozen label set affords (plan D3). The
  // floor puts the LARGER drawn dimension at the legibility extent, matching
  // the old 42×42 minimum cell.
  let s = s0;
  let starved = false;
  if (outside.length > 0) {
    const sFloor =
      calculateMinLabelPlotExtent(rc, mergedStyle.text.dataLabels) /
      Math.max(projBounds.w, projBounds.h);
    const fits = (trialS: number) => {
      const e = mapExtentsAt(
        outside,
        unitGeom,
        trialS,
        gap,
        mergedStyle.map.calloutMargin,
      );
      return e.left + e.right <= cellRcd.w() && e.top + e.bottom <= cellRcd.h();
    };
    const result = solveContentScale(fits, sFloor, s0);
    // infeasible: even the legibility floor cannot fit. Draw at the floor
    // anyway (legibility beats frame) and report it as cramped (plan D6).
    starved = result.kind === "infeasible";
    s = result.kind === "ok" ? result.s : Math.min(sFloor, s0);
  }

  return {
    indices,
    cellRcd,
    featuresForFitting,
    shown,
    unitGeom,
    entries,
    outsideIds,
    outside,
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
    cellRcd,
    featuresForFitting,
    shown,
    unitGeom,
    entries,
    outsideIds,
    outside,
    degenerate,
  } = solvedCell;
  const { paneIndex, tierIndex, laneIndex } = indices;
  const gap = mergedStyle.map.labelCollision.gap;

  if (degenerate || !unitGeom || s <= 0) {
    const fitted = fitProjectionAtScale(
      featuresForFitting,
      projectionFn,
      0,
      cellRcd.centerX(),
      cellRcd.centerY(),
    );
    return generateMapRegionPrimitives(
      cellRcd,
      shown,
      fitted,
      paneIndex,
      tierIndex,
      laneIndex,
    );
  }

  // Centre the union bbox in the cell — in BOTH dimensions: at s at most one
  // dimension is tight, and centring when underfilling is the standing rule.
  let cx = cellRcd.centerX();
  let cy = cellRcd.centerY();
  if (outside.length > 0) {
    const extents = mapExtentsAt(
      outside,
      unitGeom,
      s,
      gap,
      mergedStyle.map.calloutMargin,
    );
    cx = cellRcd.x() + (cellRcd.w() - (extents.left + extents.right)) / 2 +
      extents.left;
    cy = cellRcd.y() + (cellRcd.h() - (extents.top + extents.bottom)) / 2 +
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
    cellRcd,
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
      cellRcd,
      s,
      cx,
      cy,
      mergedStyle,
      indices,
    ),
  );

  return primitives;
}
