// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  MapLabelPrimitive,
  MergedMapDataLabelsStyle,
  MergedMapStyle,
  Primitive,
  RectCoordsDims,
  RenderContext,
} from "../deps.ts";
import { Coordinates, Z_INDEX } from "../deps.ts";
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
  screenBBox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | undefined;
  mText: ReturnType<RenderContext["mText"]>;
};

export function generateMapLabelPrimitives(
  rc: RenderContext,
  cellRcd: RectCoordsDims,
  filteredFeatures: GeoJSONFeature[],
  valueMap: Record<string, number | undefined>,
  areaMatchProp: string,
  mergedStyle: MergedMapStyle,
  fitted: FittedProjection,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): Primitive[] {
  const dlStyle = mergedStyle.map.dataLabels;
  if (dlStyle.mode === "none") return [];

  const textStyle = mergedStyle.text.dataLabels;
  const labelInfos: LabelInfo[] = [];

  for (const feature of filteredFeatures) {
    const featureId = getFeatureMatchKey(feature, areaMatchProp);
    const value = valueMap[featureId];

    const labelText = resolveDataLabelText(
      featureId,
      feature.properties,
      value,
      dlStyle,
    );
    if (!labelText) continue;

    const geoCentroid = computeGeoCentroid(feature.geometry);
    if (!geoCentroid) continue;

    const offset = dlStyle.centroidOffsets?.[featureId];
    const screenPos = projectCentroid(geoCentroid, fitted, offset);
    const screenBBox = dlStyle.mode === "auto"
      ? computeScreenBBox(feature.geometry, fitted)
      : undefined;

    const mText = rc.mText(labelText, textStyle, cellRcd.w() * 0.4);

    labelInfos.push({
      featureId,
      feature,
      value,
      screenPos,
      screenBBox,
      mText,
    });
  }

  const primitives: Primitive[] = [];
  const calloutInfos: LabelInfo[] = [];

  for (const info of labelInfos) {
    const placement = resolvePlacement(dlStyle.mode, info);
    if (placement === "centroid") {
      primitives.push(
        createCentroidLabel(
          info,
          cellRcd,
          dlStyle,
          paneIndex,
          tierIndex,
          laneIndex,
        ),
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
        dlStyle,
        paneIndex,
        tierIndex,
        laneIndex,
      ),
    );
  }

  return primitives;
}

function resolveDataLabelText(
  featureId: string,
  featureProperties: Record<string, unknown>,
  value: number | undefined,
  dlStyle: MergedMapDataLabelsStyle,
): string | undefined {
  if (dlStyle.formatter) {
    return dlStyle.formatter({ featureId, featureProperties, value });
  }

  const parts: string[] = [];

  if (dlStyle.nameProp) {
    const name = featureProperties[dlStyle.nameProp];
    if (name !== undefined && name !== null) {
      parts.push(String(name));
    }
  } else {
    parts.push(featureId);
  }

  if (dlStyle.showValue && value !== undefined) {
    parts.push(dlStyle.valueFormatter(value));
  }

  return parts.length > 0 ? parts.join("\n") : undefined;
}

function resolvePlacement(
  mode: MergedMapDataLabelsStyle["mode"],
  info: LabelInfo,
): "centroid" | "callout" {
  if (mode === "centroid") return "centroid";
  if (mode === "callout") return "callout";

  // Auto: check if text fits inside the region's screen bounding box
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
  dlStyle: MergedMapDataLabelsStyle,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapLabelPrimitive {
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
    halo: dlStyle.halo.width > 0
      ? { color: dlStyle.halo.color, width: dlStyle.halo.width }
      : undefined,
  };
}

function createCalloutLabels(
  infos: LabelInfo[],
  cellRcd: RectCoordsDims,
  dlStyle: MergedMapDataLabelsStyle,
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
    dlStyle,
    "left",
    paneIndex,
    tierIndex,
    laneIndex,
    primitives,
  );
  placeCalloutSide(
    rightItems,
    cellRcd,
    dlStyle,
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
  dlStyle: MergedMapDataLabelsStyle,
  side: "left" | "right",
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
  out: MapLabelPrimitive[],
): void {
  if (items.length === 0) return;

  const margin = dlStyle.calloutMargin;
  const labelX = side === "left"
    ? cellRcd.x() + margin * 0.3
    : cellRcd.rightX() - margin * 0.3;
  const alignH = side === "left" ? "left" as const : "right" as const;

  const totalH = cellRcd.h();
  const spacing = totalH / (items.length + 1);

  for (let i = 0; i < items.length; i++) {
    const info = items[i];
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
      halo: dlStyle.halo.width > 0
        ? { color: dlStyle.halo.color, width: dlStyle.halo.width }
        : undefined,
      leaderLine: {
        from: centroidCoords,
        to: labelCoords,
        strokeColor: dlStyle.leaderLine.strokeColor,
        strokeWidth: dlStyle.leaderLine.strokeWidth,
        gap: dlStyle.leaderLine.gap,
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
