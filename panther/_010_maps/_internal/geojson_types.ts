// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type GeoJSONPosition = [number, number];

export type GeoJSONPolygon = {
  type: "Polygon";
  coordinates: GeoJSONPosition[][];
};

export type GeoJSONMultiPolygon = {
  type: "MultiPolygon";
  coordinates: GeoJSONPosition[][][];
};

export type GeoJSONPoint = {
  type: "Point";
  coordinates: GeoJSONPosition;
};

export type GeoJSONMultiPoint = {
  type: "MultiPoint";
  coordinates: GeoJSONPosition[];
};

export type GeoJSONLineString = {
  type: "LineString";
  coordinates: GeoJSONPosition[];
};

export type GeoJSONMultiLineString = {
  type: "MultiLineString";
  coordinates: GeoJSONPosition[][];
};

export type GeoJSONGeometryCollection = {
  type: "GeometryCollection";
  geometries: GeoJSONGeometry[];
};

export type GeoJSONGeometry =
  | GeoJSONPolygon
  | GeoJSONMultiPolygon
  | GeoJSONPoint
  | GeoJSONMultiPoint
  | GeoJSONLineString
  | GeoJSONMultiLineString
  | GeoJSONGeometryCollection;

export type GeoJSONFeature = {
  type: "Feature";
  geometry: GeoJSONGeometry;
  properties: Record<string, unknown>;
  id?: string | number;
};

export type GeoJSONFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJSONFeature[];
};

export type TopoJSONTopology = {
  type: "Topology";
  objects: Record<string, TopoJSONGeometryCollection>;
  arcs: number[][][];
  transform?: {
    scale: [number, number];
    translate: [number, number];
  };
};

export type TopoJSONGeometryCollection = {
  type: "GeometryCollection";
  geometries: TopoJSONGeometry[];
};

export type TopoJSONGeometry = {
  type: string;
  arcs?: number[] | number[][] | number[][][];
  properties?: Record<string, unknown>;
  id?: string | number;
};
