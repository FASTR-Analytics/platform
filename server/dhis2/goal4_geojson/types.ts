export type { FetchOptions } from "../common/mod.ts";

// Unvalidated JSON from an external server: every field may be missing or
// null. The collection's `type` and `features` are checked by the fetcher;
// each feature is checked where it is processed.
export type GeoJsonFeature = {
  type: string | null | undefined;
  geometry: Record<string, unknown> | null | undefined;
  properties: Record<string, unknown> | null | undefined;
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

// Analyze-side cache payload: org-unit metadata + the exact with-geometry
// count. The user builds the mapping against this; no coordinates involved.
export type CachedGeoJsonMetadata = {
  fetchedAt: number;
  units: Dhis2FeatureContext[];
  withGeometryCount: number;
};

// Save-side cache payload: the full FeatureCollection (~20 MB for a
// 200-district country): kept only so a re-save doesn't re-fetch.
export type CachedHeavyGeoJson = {
  fetchedAt: number;
  featureCollection: GeoJsonFeatureCollection;
};
