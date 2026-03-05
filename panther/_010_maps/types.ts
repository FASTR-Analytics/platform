// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  FigureInputsBase,
  JsonArray,
  MeasuredChartBase,
  MergedMapStyle,
} from "./deps.ts";
import type {
  GeoJSONFeature,
  GeoJSONFeatureCollection,
  TopoJSONTopology,
} from "./_internal/geojson_types.ts";

export type MapInputs = FigureInputsBase & {
  mapData: MapData;
};

export type MapData = MapDataJson | MapDataTransformed;

export type MapDataJson = {
  geoData: MapGeoInput;
  jsonArray: JsonArray;
  jsonDataConfig: MapJsonDataConfig;
};

export type MapGeoInput =
  | GeoJSONFeatureCollection
  | { type: "topojson"; topology: TopoJSONTopology; objectName: string };

export type MapJsonDataConfig = {
  valueProp: string;
  areaProp: string;
  areaMatchProp: string;
  paneProp?: string;
  tierProp?: string;
  laneProp?: string;
  sortHeaders?: boolean | string[];
  labelReplacements?: Record<string, string>;
};

export type MapDataTransformed = {
  isTransformed: true;
  geoFeatures: GeoJSONFeature[];
  areaMatchProp: string;
  paneHeaders: string[];
  tierHeaders: string[];
  laneHeaders: string[];
  valueMaps: Record<string, number | undefined>[][][];
  valueRange: { min: number; max: number };
};

export type MeasuredMap = MeasuredChartBase<
  MapInputs,
  MapDataTransformed,
  MergedMapStyle
>;
