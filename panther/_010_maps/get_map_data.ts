// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createHeaderItems, type JsonArray, sortHeaderItems } from "./deps.ts";
import type { GeoJSONFeature } from "./_internal/geojson_types.ts";
import { decodeTopojson } from "./_internal/topojson_decode.ts";
import type { MapData, MapDataJson, MapDataTransformed } from "./types.ts";

export function getMapDataTransformed(mapData: MapData): MapDataTransformed {
  if ("isTransformed" in mapData) return mapData;
  return transformMapData(mapData);
}

function transformMapData(data: MapDataJson): MapDataTransformed {
  const geoFeatures = resolveGeoFeatures(data);
  const config = data.jsonDataConfig;
  const jsonArray = data.jsonArray;

  const paneHeaders = sortHeaderItems(
    createHeaderItems(
      collectUniqueHeaders(jsonArray, config.paneProp),
      config.labelReplacements,
    ),
    config.sort?.pane,
  );
  const tierHeaders = sortHeaderItems(
    createHeaderItems(
      collectUniqueHeaders(jsonArray, config.tierProp),
      config.labelReplacements,
    ),
    config.sort?.tier,
  );
  const laneHeaders = sortHeaderItems(
    createHeaderItems(
      collectUniqueHeaders(jsonArray, config.laneProp),
      config.labelReplacements,
    ),
    config.sort?.lane,
  );

  const valueMaps: Record<string, number | undefined>[][][] = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (let ip = 0; ip < paneHeaders.length; ip++) {
    valueMaps[ip] = [];
    for (let it = 0; it < tierHeaders.length; it++) {
      valueMaps[ip][it] = [];
      for (let il = 0; il < laneHeaders.length; il++) {
        valueMaps[ip][it][il] = {};
      }
    }
  }

  for (const row of jsonArray) {
    const areaId = String(row[config.areaProp] ?? "");
    const rawValue = row[config.valueProp];
    const value = typeof rawValue === "number" ? rawValue : undefined;

    const ip = config.paneProp
      ? paneHeaders.findIndex((h) =>
        h.id === String(row[config.paneProp!] ?? "")
      )
      : 0;
    const it = config.tierProp
      ? tierHeaders.findIndex((h) =>
        h.id === String(row[config.tierProp!] ?? "")
      )
      : 0;
    const il = config.laneProp
      ? laneHeaders.findIndex((h) =>
        h.id === String(row[config.laneProp!] ?? "")
      )
      : 0;

    if (ip === -1 || it === -1 || il === -1) continue;

    valueMaps[ip][it][il][areaId] = value;
    if (value !== undefined) {
      if (value < globalMin) globalMin = value;
      if (value > globalMax) globalMax = value;
    }
  }

  if (!isFinite(globalMin)) globalMin = 0;
  if (!isFinite(globalMax)) globalMax = 1;

  return {
    isTransformed: true,
    geoFeatures,
    areaMatchProp: config.areaMatchProp,
    paneHeaders,
    tierHeaders,
    laneHeaders,
    valueMaps,
    valueRange: { min: globalMin, max: globalMax },
  };
}

function resolveGeoFeatures(data: MapDataJson): GeoJSONFeature[] {
  if (data.geoData.type === "FeatureCollection") {
    return data.geoData.features;
  }
  const decoded = decodeTopojson(
    data.geoData.topology,
    data.geoData.objectName,
  );
  return decoded.features;
}

function collectUniqueHeaders(
  jsonArray: JsonArray,
  prop: string | undefined,
): string[] {
  if (!prop) return [""];
  const seen = new Set<string>();
  const headers: string[] = [];
  for (const row of jsonArray) {
    const v = String(row[prop] ?? "");
    if (!seen.has(v)) {
      seen.add(v);
      headers.push(v);
    }
  }
  return headers;
}
