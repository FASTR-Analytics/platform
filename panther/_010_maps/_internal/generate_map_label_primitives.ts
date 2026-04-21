// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DataLabelStyle,
  MapDataLabelMode,
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
  projectCentroid,
} from "./centroid.ts";

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
