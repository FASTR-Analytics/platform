// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  LabelMode,
  MapDataLabelMode,
  MapRegionInfo,
  MapRegionInfoFunc,
  RectCoordsDims,
  RenderContext,
  TextInfoUnkeyed,
} from "../deps.ts";
import { buildDataLabelTextStyle } from "../deps.ts";
import type { GeoJSONFeature } from "./geojson_types.ts";

// map.dataLabelMode names an ANCHOR RULE ("centroid"); the shared label system
// names a REGION ("inside"). Same resolved placement, different vocabulary —
// this is the only place the two meet.
export function toLabelMode(mode: MapDataLabelMode): LabelMode {
  switch (mode) {
    case "none":
      return "none";
    case "centroid":
      return "inside";
    case "callout":
      return "outside";
    case "auto":
      return "auto";
  }
}

export function buildMapRegionInfo(
  featureId: string,
  feature: GeoJSONFeature,
  value: number | undefined,
  paneIndex: number,
  tierIndex: number,
  laneIndex: number,
): MapRegionInfo {
  return {
    featureId,
    value,
    valueMin: 0,
    valueMax: 0,
    featureProperties: feature.properties,
    paneIndex,
    tierIndex,
    laneIndex,
  };
}

export function resolveMapLabelText(
  textFormatter: MapRegionInfoFunc<string | undefined> | "none",
  info: MapRegionInfo,
): string | undefined {
  if (textFormatter !== "none") return textFormatter(info);
  return info.value !== undefined ? String(info.value) : info.featureId;
}

// The wrap width is a fraction of the CELL, and it is the same fraction for the
// gutter-reservation pass and the label pass, so what is reserved is what is
// drawn (map.labelWrapFraction).
export function measureMapLabel(
  rc: RenderContext,
  labelText: string,
  cellRcd: RectCoordsDims,
  baseTextStyle: TextInfoUnkeyed,
  dlStyle: Parameters<typeof buildDataLabelTextStyle>[1],
  labelWrapFraction: number,
) {
  return rc.mText(
    labelText,
    buildDataLabelTextStyle(baseTextStyle, dlStyle),
    cellRcd.w() * labelWrapFraction,
  );
}

export function getFeatureMatchKey(
  feature: GeoJSONFeature,
  areaMatchProp: string,
): string {
  const val = feature.properties[areaMatchProp];
  if (val !== undefined && val !== null) return String(val);
  if (feature.id !== undefined) return String(feature.id);
  return "";
}
