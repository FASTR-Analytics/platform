// Parsed from an uploaded file or a DHIS2 response, never validated: every
// field may be missing or null.
export type GeoJsonFeature = {
  type: string | null | undefined;
  geometry: Record<string, unknown> | null | undefined;
  properties: Record<string, unknown> | null | undefined;
};

export type GeoJsonFeatureCollection = {
  type: string | null | undefined;
  features: GeoJsonFeature[] | null | undefined;
};
