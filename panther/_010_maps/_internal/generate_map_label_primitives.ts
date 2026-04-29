// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DataLabelStyle,
  MapDataLabelMode,
  MapLabelCollisionConfig,
  MapLabelPrimitive,
  MapRegionInfoFunc,
  MapRegionStyle,
  MergedMapStyle,
  Primitive,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { Coordinates, getColor, Z_INDEX } from "../deps.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";
import type { FittedProjection } from "./fit_projection.ts";
import {
  computeGeoCentroid,
  computeScreenBBox,
  findBoundaryIntersection,
  projectCentroid,
} from "./centroid.ts";
import {
  type CollisionLabel,
  resolveCalloutCollisions,
  resolveCentroidCollisions,
} from "./label_collision.ts";

type LabelInfo = {
  featureId: string;
  feature: GeoJSONFeature;
  value: number | undefined;
  screenPos: { x: number; y: number };
  screenBBox:
    | {
      minX: number;
      minY: number;
      maxX: number;
      maxY: number;
    }
    | undefined;
  mText: ReturnType<RenderContext["mText"]>;
  regionStyle: MapRegionStyle;
};

export function generateMapLabelPrimitives(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  filteredFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  areaMatchProp: string,
  mergedStyle: MergedMapStyle,
  fitted: FittedProjection,
  shownFeatureStyles: Map<string, MapRegionStyle>,
  textFormatter: MapRegionInfoFunc<string | undefined> | "none",
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): Primitive[] {
  const dlMode = mergedStyle.map.dataLabelMode;
  if (dlMode === "none") return [];

  if (mergedStyle.map.labelPositioning === "v2") {
    return generateMapLabelPrimitivesV2(
      rc,
      cellRcd,
      filteredFeatures,
      valueMap,
      areaMatchProp,
      mergedStyle,
      fitted,
      shownFeatureStyles,
      textFormatter,
      paneIndex,
      tierIndex,
      laneIndex,
    );
  }

  const baseTextStyle = mergedStyle.text.dataLabels;
  const labelInfos: LabelInfo[] = [];

  for (const feature of filteredFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];

    const regionStyle = shownFeatureStyles.get(featureId);
    if (!regionStyle) continue;
    const dlStyle = regionStyle.dataLabel;
    if (!dlStyle.show) continue;

    const mapRegionInfo = {
      featureId,
      value,
      valueMin: 0,
      valueMax: 0,
      featureProperties: feature.properties,
      paneIndex,
      tierIndex,
      laneIndex,
    };
    const labelText = textFormatter !== "none"
      ? textFormatter(mapRegionInfo)
      : value !== undefined
      ? String(value)
      : featureId;
    if (!labelText) continue;

    const geoCentroid = computeGeoCentroid(feature.geometry);
    if (!geoCentroid) continue;

    const offset = regionStyle.centroidOffset;
    const screenPos = projectCentroid(geoCentroid, fitted, offset);
    const screenBBox = dlMode === "auto"
      ? computeScreenBBox(feature.geometry, fitted)
      : undefined;

    const textStyle: TextInfoUnkeyed = {
      ...baseTextStyle,
      ...(dlStyle.color !== undefined
        ? { color: getColor(dlStyle.color) }
        : {}),
      ...(dlStyle.relFontSize !== undefined
        ? { fontSize: baseTextStyle.fontSize * dlStyle.relFontSize }
        : {}),
    };

    const mText = rc.mText(labelText, textStyle, cellRcd.w() * 0.4);

    labelInfos.push({
      featureId,
      feature,
      value,
      screenPos,
      screenBBox,
      mText,
      regionStyle,
    });
  }

  const primitives: Primitive[] = [];
  const calloutInfos: LabelInfo[] = [];

  for (const info of labelInfos) {
    const placement = resolvePlacement(dlMode, info);
    if (placement === "centroid") {
      primitives.push(
        createCentroidLabel(info, cellRcd, paneIndex, tierIndex, laneIndex),
      );
    } else {
      calloutInfos.push(info);
    }
  }

  if (calloutInfos.length > 0) {
    primitives.push(
      ...createCalloutLabels(
        calloutInfos,
        cellRcd,
        mergedStyle.map.calloutMargin,
        paneIndex,
        tierIndex,
        laneIndex,
      ),
    );
  }

  return primitives;
}

function buildHalo(dl: DataLabelStyle): MapLabelPrimitive["halo"] {
  const fillColor = dl.backgroundColor !== "none"
    ? getColor(dl.backgroundColor)
    : undefined;
  const borderColor = dl.borderWidth > 0 && dl.borderColor !== undefined
    ? getColor(dl.borderColor)
    : undefined;
  const borderWidth = borderColor !== undefined ? dl.borderWidth : undefined;
  if (!fillColor && !borderColor) return undefined;
  return {
    fillColor,
    borderColor,
    borderWidth,
    padding: dl.padding,
    rectRadius: dl.rectRadius,
  };
}

function resolvePlacement(
  mode: MapDataLabelMode,
  info: LabelInfo,
): "centroid" | "callout" {
  if (mode === "centroid") return "centroid";
  if (mode === "callout") return "callout";

  if (!info.screenBBox) return "centroid";

  const textW = info.mText.dims.w();
  const textH = info.mText.dims.h();
  const bboxW = info.screenBBox.maxX - info.screenBBox.minX;
  const bboxH = info.screenBBox.maxY - info.screenBBox.minY;

  return textW <= bboxW * 0.9 && textH <= bboxH * 0.9 ? "centroid" : "callout";
}

function createCentroidLabel(
  info: LabelInfo,
  cellRcd: RectCoordsDims,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive {
  const dl = info.regionStyle.dataLabel;
  return {
    type: "map-label",
    key: `map-label-${paneIndex}-${tierIndex}-${laneIndex}-${info.featureId}`,
    bounds: cellRcd,
    zIndex: Z_INDEX.MAP_LABEL,
    meta: {
      featureId: info.featureId,
      paneIndex,
      tierIndex,
      laneIndex,
      placement: "centroid",
    },
    mText: info.mText,
    position: new Coordinates([info.screenPos.x, info.screenPos.y]),
    alignment: { h: "center", v: "middle" },
    halo: buildHalo(dl),
  };
}

function createCalloutLabels(
  infos: LabelInfo[],
  cellRcd: RectCoordsDims,
  calloutMargin: number,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive[] {
  const primitives: MapLabelPrimitive[] = [];
  const centerX = cellRcd.centerX();

  const leftItems = infos
    .filter((i) => i.screenPos.x <= centerX)
    .sort((a, b) => a.screenPos.y - b.screenPos.y);
  const rightItems = infos
    .filter((i) => i.screenPos.x > centerX)
    .sort((a, b) => a.screenPos.y - b.screenPos.y);

  placeCalloutSide(
    leftItems,
    cellRcd,
    calloutMargin,
    "left",
    paneIndex,
    tierIndex,
    laneIndex,
    primitives,
  );
  placeCalloutSide(
    rightItems,
    cellRcd,
    calloutMargin,
    "right",
    paneIndex,
    tierIndex,
    laneIndex,
    primitives,
  );

  return primitives;
}

function placeCalloutSide(
  items: LabelInfo[],
  cellRcd: RectCoordsDims,
  calloutMargin: number,
  side: "left" | "right",
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
  out: MapLabelPrimitive[],
): void {
  if (items.length === 0) return;

  const labelX = side === "left"
    ? cellRcd.x() + calloutMargin * 0.3
    : cellRcd.rightX() - calloutMargin * 0.3;
  const alignH = side === "left" ? ("left" as const) : ("right" as const);

  const totalH = cellRcd.h();
  const spacing = totalH / (items.length + 1);

  for (let i = 0; i < items.length; i++) {
    const info = items[i];
    const rs = info.regionStyle;
    const dlStyle = rs.dataLabel;
    const labelY = cellRcd.y() + spacing * (i + 1);

    const centroidCoords = new Coordinates([
      info.screenPos.x,
      info.screenPos.y,
    ]);
    const labelCoords = new Coordinates([labelX, labelY]);

    out.push({
      type: "map-label",
      key: `map-label-${paneIndex}-${tierIndex}-${laneIndex}-${info.featureId}`,
      bounds: cellRcd,
      zIndex: Z_INDEX.MAP_LABEL,
      meta: {
        featureId: info.featureId,
        paneIndex,
        tierIndex,
        laneIndex,
        placement: "callout",
      },
      mText: info.mText,
      position: labelCoords,
      alignment: { h: alignH, v: "middle" },
      halo: buildHalo(dlStyle),
      leaderLine: {
        from: centroidCoords,
        to: labelCoords,
        strokeColor: getColor(rs.leaderLineStrokeColor),
        strokeWidth: rs.leaderLineStrokeWidth,
        gap: rs.leaderLineGap,
      },
    });
  }
}

function getFeatureMatchKey(
  feature: GeoJSONFeature,
  areaMatchProp: string,
): string {
  const val = feature.properties[areaMatchProp];
  if (val !== undefined && val !== null) return String(val);
  if (feature.id !== undefined) return String(feature.id);
  return "";
}

type LabelInfoV2 = LabelInfo & {
  placement: "centroid" | "callout";
};

function generateMapLabelPrimitivesV2(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  filteredFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  areaMatchProp: string,
  mergedStyle: MergedMapStyle,
  fitted: FittedProjection,
  shownFeatureStyles: Map<string, MapRegionStyle>,
  textFormatter: MapRegionInfoFunc<string | undefined> | "none",
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): Primitive[] {
  const dlMode = mergedStyle.map.dataLabelMode;
  const collisionConfig = mergedStyle.map.labelCollision;
  const baseTextStyle = mergedStyle.text.dataLabels;
  const labelInfos: LabelInfoV2[] = [];

  for (const feature of filteredFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];

    const regionStyle = shownFeatureStyles.get(featureId);
    if (!regionStyle) continue;
    const dlStyle = regionStyle.dataLabel;
    if (!dlStyle.show) continue;

    const mapRegionInfo = {
      featureId,
      value,
      valueMin: 0,
      valueMax: 0,
      featureProperties: feature.properties,
      paneIndex,
      tierIndex,
      laneIndex,
    };
    const labelText = textFormatter !== "none"
      ? textFormatter(mapRegionInfo)
      : value !== undefined
      ? String(value)
      : featureId;
    if (!labelText) continue;

    const geoCentroid = computeGeoCentroid(feature.geometry);
    if (!geoCentroid) continue;

    const offset = regionStyle.centroidOffset;
    const screenPos = projectCentroid(geoCentroid, fitted, offset);
    const screenBBox = dlMode === "auto"
      ? computeScreenBBox(feature.geometry, fitted)
      : undefined;

    const textStyle: TextInfoUnkeyed = {
      ...baseTextStyle,
      ...(dlStyle.color !== undefined
        ? { color: getColor(dlStyle.color) }
        : {}),
      ...(dlStyle.relFontSize !== undefined
        ? { fontSize: baseTextStyle.fontSize * dlStyle.relFontSize }
        : {}),
    };

    const mText = rc.mText(labelText, textStyle, cellRcd.w() * 0.4);

    const placement = resolvePlacement(dlMode, {
      featureId,
      feature,
      value,
      screenPos,
      screenBBox,
      mText,
      regionStyle,
    });

    labelInfos.push({
      featureId,
      feature,
      value,
      screenPos,
      screenBBox,
      mText,
      regionStyle,
      placement,
    });
  }

  let mapMinX = Infinity;
  let mapMaxX = -Infinity;
  let mapMinY = Infinity;
  let mapMaxY = -Infinity;

  for (const feature of filteredFeatures) {
    const bbox = computeScreenBBox(feature.geometry, fitted);
    if (bbox) {
      mapMinX = Math.min(mapMinX, bbox.minX);
      mapMaxX = Math.max(mapMaxX, bbox.maxX);
      mapMinY = Math.min(mapMinY, bbox.minY);
      mapMaxY = Math.max(mapMaxY, bbox.maxY);
    }
  }

  const overallMapBounds = {
    minX: mapMinX,
    maxX: mapMaxX,
    minY: mapMinY,
    maxY: mapMaxY,
  };

  const centroidInfos = labelInfos.filter((i) => i.placement === "centroid");
  const calloutInfos = labelInfos.filter((i) => i.placement === "callout");

  const primitives: Primitive[] = [];

  if (centroidInfos.length > 0) {
    primitives.push(
      ...createCentroidLabelsV2(
        centroidInfos,
        cellRcd,
        collisionConfig,
        paneIndex,
        tierIndex,
        laneIndex,
      ),
    );
  }

  if (calloutInfos.length > 0) {
    primitives.push(
      ...createCalloutLabelsV2(
        calloutInfos,
        cellRcd,
        overallMapBounds,
        filteredFeatures,
        fitted,
        collisionConfig,
        paneIndex,
        tierIndex,
        laneIndex,
      ),
    );
  }

  return primitives;
}

function createCentroidLabelsV2(
  infos: LabelInfoV2[],
  cellRcd: RectCoordsDims,
  collisionConfig: MapLabelCollisionConfig,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive[] {
  const collisionLabels: (CollisionLabel & { info: LabelInfoV2 })[] = infos.map(
    (info) => ({
      info,
      naturalX: info.screenPos.x,
      naturalY: info.screenPos.y,
      x: info.screenPos.x,
      y: info.screenPos.y,
      width: info.mText.dims.w(),
      height: info.mText.dims.h(),
    }),
  );

  resolveCentroidCollisions(
    collisionLabels,
    collisionConfig.maxIterations,
    collisionConfig.maxCentroidDisplacement,
  );

  return collisionLabels.map((cl) => {
    const info = cl.info;
    const dl = info.regionStyle.dataLabel;
    return {
      type: "map-label" as const,
      key: `map-label-${paneIndex}-${tierIndex}-${laneIndex}-${info.featureId}`,
      bounds: cellRcd,
      zIndex: Z_INDEX.MAP_LABEL,
      meta: {
        featureId: info.featureId,
        paneIndex,
        tierIndex,
        laneIndex,
        placement: "centroid" as const,
      },
      mText: info.mText,
      position: new Coordinates([cl.x, cl.y]),
      alignment: { h: "center" as const, v: "middle" as const },
      halo: buildHalo(dl),
    };
  });
}

function createCalloutLabelsV2(
  infos: LabelInfoV2[],
  cellRcd: RectCoordsDims,
  mapBounds: { minX: number; maxX: number; minY: number; maxY: number },
  allFeatures: GeoJSONFeature[],
  fitted: FittedProjection,
  collisionConfig: MapLabelCollisionConfig,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive[] {
  const centerX = cellRcd.centerX();
  const gap = collisionConfig.gap;

  const leftInfos = infos.filter((i) => i.screenPos.x <= centerX);
  const rightInfos = infos.filter((i) => i.screenPos.x > centerX);

  const primitives: MapLabelPrimitive[] = [];

  primitives.push(
    ...placeCalloutSideV2(
      leftInfos,
      cellRcd,
      mapBounds,
      allFeatures,
      fitted,
      "left",
      gap,
      paneIndex,
      tierIndex,
      laneIndex,
    ),
  );
  primitives.push(
    ...placeCalloutSideV2(
      rightInfos,
      cellRcd,
      mapBounds,
      allFeatures,
      fitted,
      "right",
      gap,
      paneIndex,
      tierIndex,
      laneIndex,
    ),
  );

  return primitives;
}

function findMapBoundaryAtY(
  allFeatures: GeoJSONFeature[],
  fitted: FittedProjection,
  side: "left" | "right",
  atY: number,
): number | undefined {
  let bestX: number | undefined;

  for (const feature of allFeatures) {
    const intersection = findBoundaryIntersection(
      feature.geometry,
      fitted,
      side,
      atY,
    );
    if (intersection) {
      if (bestX === undefined) {
        bestX = intersection.x;
      } else if (side === "left") {
        bestX = Math.min(bestX, intersection.x);
      } else {
        bestX = Math.max(bestX, intersection.x);
      }
    }
  }

  return bestX;
}

function placeCalloutSideV2(
  infos: LabelInfoV2[],
  cellRcd: RectCoordsDims,
  mapBounds: { minX: number; maxX: number; minY: number; maxY: number },
  allFeatures: GeoJSONFeature[],
  fitted: FittedProjection,
  side: "left" | "right",
  gap: number,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive[] {
  if (infos.length === 0) return [];

  const collisionLabels: (CollisionLabel & { info: LabelInfoV2 })[] = infos.map(
    (info) => ({
      info,
      naturalX: 0,
      naturalY: info.screenPos.y,
      x: 0,
      y: info.screenPos.y,
      width: info.mText.dims.w(),
      height: info.mText.dims.h(),
    }),
  );

  resolveCalloutCollisions(
    collisionLabels,
    { minY: mapBounds.minY, maxY: mapBounds.maxY },
    gap,
  );

  return collisionLabels.map((cl) => {
    const info = cl.info;
    const rs = info.regionStyle;
    const dlStyle = rs.dataLabel;
    const finalY = cl.y + cl.height / 2;

    const boundaryX = findMapBoundaryAtY(allFeatures, fitted, side, finalY);
    const haloPad = dlStyle.padding;

    let labelX: number;
    if (boundaryX !== undefined) {
      if (side === "left") {
        labelX = boundaryX - gap - cl.width - haloPad.pr();
      } else {
        labelX = boundaryX + gap + haloPad.pl();
      }
    } else {
      if (side === "left") {
        labelX = mapBounds.minX - gap - cl.width - haloPad.pr();
      } else {
        labelX = mapBounds.maxX + gap + haloPad.pl();
      }
    }

    const labelCoords = new Coordinates([labelX, finalY]);
    const centroidCoords = new Coordinates([
      info.screenPos.x,
      info.screenPos.y,
    ]);

    return {
      type: "map-label" as const,
      key: `map-label-${paneIndex}-${tierIndex}-${laneIndex}-${info.featureId}`,
      bounds: cellRcd,
      zIndex: Z_INDEX.MAP_LABEL,
      meta: {
        featureId: info.featureId,
        paneIndex,
        tierIndex,
        laneIndex,
        placement: "callout" as const,
      },
      mText: info.mText,
      position: labelCoords,
      alignment: { h: "left" as const, v: "middle" as const },
      halo: buildHalo(dlStyle),
      leaderLine: {
        from: centroidCoords,
        to: labelCoords,
        strokeColor: getColor(rs.leaderLineStrokeColor),
        strokeWidth: rs.leaderLineStrokeWidth,
        gap: rs.leaderLineGap,
      },
    };
  });
}
