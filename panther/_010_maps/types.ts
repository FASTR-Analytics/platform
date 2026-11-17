// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  DataDimension,
  FigureInputsBase,
  JsonArray,
  MeasuredChartBase,
  MemberSortConfig,
  MergedMapStyle,
  ValueRange,
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
  mapAreaProp: string;
  mapAreaMatchProp: string;
  paneProp?: string;
  tierProp?: string;
  laneProp?: string;
  labelReplacements?: Record<string, string>;
  sort?: {
    pane?: MemberSortConfig;
    tier?: MemberSortConfig;
    lane?: MemberSortConfig;
  };
};

export type MapDataTransformed = {
  isTransformed: true;
  geoFeatures: GeoJSONFeature[];
  // The map area dimension's name, the feature property its members match, and the rows
  // left off the map because their map area is the blank member.
  mapArea: { name: string; matchProp: string; nBlankRows: number };
  pane?: DataDimension;
  tier?: DataDimension;
  lane?: DataDimension;
  valueMaps: Record<string, number | undefined>[][][];
  valueRange: ValueRange;
};

export type MeasuredMap = MeasuredChartBase<
  MapInputs,
  MapDataTransformed,
  MergedMapStyle
>;
