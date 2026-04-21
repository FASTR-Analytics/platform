export type { FetchOptions } from "../common/mod.ts";

export type GeoJsonFeature = {
  type: "Feature";
  id?: string;
  geometry: Record<string, unknown> | null;
  properties: Record<string, unknown>;
};

export type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

export type Dhis2FeatureContext = {
  uid: string;
  name: string;
  code: string | null;
  parentUid: string | null;
  parentName: string | null;
};

export type GeoJsonAnalysisWithDhis2Context = {
  properties: string[];
  sampleValues: Record<string, string[]>;
  featureCount: number;
  nullGeometryCount: number;
  dhis2Features: Dhis2FeatureContext[];
};

export type CachedGeoJsonData = {
  fetchedAt: number;
  featureCollection: GeoJsonFeatureCollection;
  dhis2Features: Dhis2FeatureContext[];
};
