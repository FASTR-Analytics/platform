// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DataAxis,
  FigureInputsBase,
  HeaderSortConfig,
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
  figureType: "map";
  data: MapData;
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
  labelReplacements?: Record<string, string>;
  sort?: {
    pane?: HeaderSortConfig;
    tier?: HeaderSortConfig;
    lane?: HeaderSortConfig;
  };
};

export type MapDataTransformed = {
  isTransformed: true;
  geoFeatures: GeoJSONFeature[];
  // The area dimension, and the feature property its members match.
  area: { dimension: string; matchProp: string };
  pane?: DataAxis;
  tier?: DataAxis;
  lane?: DataAxis;
  valueMaps: Record<string, number | undefined>[][][];
  valueRange: { min: number; max: number };
};

export type MeasuredMap = MeasuredChartBase<
  MapInputs,
  MapDataTransformed,
  MergedMapStyle
>;
