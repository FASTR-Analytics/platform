// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BLANK_SENTINEL,
  buildDataDimension,
  getDimensionId,
  getDimensionMembers,
  getMemberIndex,
  type MemberSortConfig,
  validateDimensionProps,
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

  const dimensionProps = {
    mapArea: config.mapAreaProp,
    pane: config.paneProp,
    tier: config.tierProp,
    lane: config.laneProp,
  };
  validateDimensionProps(data.jsonArray, dimensionProps);

  // A row whose map area is the blank member has nothing to colour.
  const jsonArray = data.jsonArray.filter((row) =>
    getDimensionId(row, config.mapAreaProp) !== BLANK_SENTINEL
  );
  const buildDimension = (prop: string | undefined, sort?: MemberSortConfig) =>
    buildDataDimension(jsonArray, prop, [], config.labelReplacements, sort);
  const pane = buildDimension(config.paneProp, config.sort?.pane);
  const tier = buildDimension(config.tierProp, config.sort?.tier);
  const lane = buildDimension(config.laneProp, config.sort?.lane);
  const nPanes = getDimensionMembers(pane).length;
  const nTiers = getDimensionMembers(tier).length;
  const nLanes = getDimensionMembers(lane).length;

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

  for (const row of jsonArray) {
    const mapAreaId = getDimensionId(row, config.mapAreaProp);
    const rawValue = row[config.valueProp];
    const value = typeof rawValue === "number" ? rawValue : undefined;

    const ip = getMemberIndex(pane, config.valueProp, row);
    const it = getMemberIndex(tier, config.valueProp, row);
    const il = getMemberIndex(lane, config.valueProp, row);

    valueMaps[ip][it][il][mapAreaId] = value;
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
    mapArea: {
      name: config.mapAreaProp,
      matchProp: config.mapAreaMatchProp,
      nBlankRows: data.jsonArray.length - jsonArray.length,
    },
    pane,
    tier,
    lane,
    valueMaps,
    valueRange: { valueMin: globalMin, valueMax: globalMax },
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
