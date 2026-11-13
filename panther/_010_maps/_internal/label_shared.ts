// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  LabelMode,
  MapAreaInfo,
  MapAreaInfoFunc,
  MapDataLabelMode,
  RectCoordsDims,
  RenderContext,
  SubChartMembers,
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

export function buildMapAreaInfo(
  featureId: string,
  feature: GeoJSONFeature,
  value: number | undefined,
  i_pane: number,
  i_tier: number,
  i_lane: number,
  members: SubChartMembers,
): MapAreaInfo {
  return {
    featureId,
    value,
    valueMin: 0,
    valueMax: 0,
    featureProperties: feature.properties,
    i_pane,
    i_tier,
    i_lane,
    ...members,
  };
}

export function resolveMapLabelText(
  textFormatter: MapAreaInfoFunc<string | undefined> | "none",
  info: MapAreaInfo,
): string | undefined {
  if (textFormatter !== "none") return textFormatter(info);
  return info.value !== undefined ? String(info.value) : info.featureId;
}

// The wrap width is a fraction of the SUB-CHART, and it is the same fraction for the
// gutter-reservation pass and the label pass, so what is reserved is what is
// drawn (map.labelWrapFraction).
export function measureMapLabel(
  rc: RenderContext,
  labelText: string,
  subChartRcd: RectCoordsDims,
  baseTextStyle: TextInfoUnkeyed,
  dlStyle: Parameters<typeof buildDataLabelTextStyle>[1],
  labelWrapFraction: number,
) {
  return rc.mText(
    labelText,
    buildDataLabelTextStyle(baseTextStyle, dlStyle),
    subChartRcd.w() * labelWrapFraction,
  );
}

export function getFeatureMatchKey(
  feature: GeoJSONFeature,
  mapAreaMatchProp: string,
): string {
  const value = feature.properties[mapAreaMatchProp];
  if (value !== undefined && value !== null) return String(value);
  if (feature.id !== undefined) return String(feature.id);
  return "";
}
