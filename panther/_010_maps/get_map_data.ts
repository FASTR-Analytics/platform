// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  buildDataAxis,
  getHeaderIndex,
  type HeaderSortConfig,
  readDimensionId,
  slotHeaders,
  validateDistinctDimensions,
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

  validateDistinctDimensions({
    area: config.areaProp,
    pane: config.paneProp,
    tier: config.tierProp,
    lane: config.laneProp,
  });
  const axis = (prop: string | undefined, sort?: HeaderSortConfig) =>
    buildDataAxis(jsonArray, prop, [], config.labelReplacements, sort);
  const pane = axis(config.paneProp, config.sort?.pane);
  const tier = axis(config.tierProp, config.sort?.tier);
  const lane = axis(config.laneProp, config.sort?.lane);
  const nPanes = slotHeaders(pane).length;
  const nTiers = slotHeaders(tier).length;
  const nLanes = slotHeaders(lane).length;

  const valueMaps: Record<string, number | undefined>[][][] = [];
  let globalMin = Infinity;
  let globalMax = -Infinity;

  for (let ip = 0; ip < nPanes; ip++) {
    valueMaps[ip] = [];
    for (let it = 0; it < nTiers; it++) {
      valueMaps[ip][it] = [];
      for (let il = 0; il < nLanes; il++) {
        valueMaps[ip][it][il] = {};
      }
    }
  }

  for (const [i_row, row] of jsonArray.entries()) {
    const areaId = readDimensionId(row, config.areaProp, i_row);
    const rawValue = row[config.valueProp];
    const value = typeof rawValue === "number" ? rawValue : undefined;

    const ip = getHeaderIndex(pane, config.valueProp, row);
    const it = getHeaderIndex(tier, config.valueProp, row);
    const il = getHeaderIndex(lane, config.valueProp, row);

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
    area: { dimension: config.areaProp, matchProp: config.areaMatchProp },
    pane,
    tier,
    lane,
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
