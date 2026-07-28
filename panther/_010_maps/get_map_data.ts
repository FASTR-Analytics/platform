// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  collectHeaders,
  createHeaderItems,
  getHeaderIndex,
  sortHeaderItems,
} from "./deps.ts";
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
      collectHeaders(jsonArray, config.paneProp, []),
      config.labelReplacements,
    ),
    config.sort?.pane,
  );
  const tierHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(jsonArray, config.tierProp, []),
      config.labelReplacements,
    ),
    config.sort?.tier,
  );
  const laneHeaders = sortHeaderItems(
    createHeaderItems(
      collectHeaders(jsonArray, config.laneProp, []),
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

    const ip = getHeaderIndex(
      config.paneProp,
      config.valueProp,
      row,
      paneHeaders,
    );
    const it = getHeaderIndex(
      config.tierProp,
      config.valueProp,
      row,
      tierHeaders,
    );
    const il = getHeaderIndex(
      config.laneProp,
      config.valueProp,
      row,
      laneHeaders,
    );

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
