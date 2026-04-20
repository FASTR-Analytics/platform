import type { Dhis2Credentials, GeoJsonMapSummary } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

type Dhis2FeatureContext = {
  uid: string;
  name: string;
  code: string | null;
  parentUid: string | null;
  parentName: string | null;
};

export const geojsonMapRouteRegistry = {
  getGeoJsonMaps: route({
    path: "/geojson-maps",
    method: "GET",
    response: {} as GeoJsonMapSummary[],
  }),
  analyzeGeoJsonUpload: route({
    path: "/geojson-maps/analyze",
    method: "POST",
    body: {} as { assetFileName: string },
    response: {} as {
      properties: string[];
      sampleValues: Record<string, string[]>;
      featureCount: number;
    },
  }),
  saveGeoJsonMap: route({
    path: "/geojson-maps/save",
    method: "POST",
    body: {} as {
      adminAreaLevel: number;
      assetFileName: string;
      areaMatchProp: string;
      areaMapping: Record<string, string>;
    },
  }),
  deleteGeoJsonMap: route({
    path: "/geojson-maps/delete",
    method: "POST",
    body: {} as { adminAreaLevel: number },
  }),
  getAdminAreaNamesForLevel: route({
    path: "/geojson-maps/admin-areas/:level",
    method: "GET",
    params: {} as { level: string },
    response: {} as string[],
  }),
  getAdminAreaOptionsForLevel: route({
    path: "/geojson-maps/admin-area-options/:level",
    method: "GET",
    params: {} as { level: string },
    response: {} as Array<{ value: string; label: string }>,
  }),
  getGeoJsonForLevel: route({
    path: "/geojson-maps/level/:level",
    method: "GET",
    params: {} as { level: string },
    response: {} as { geojson: string; uploadedAt: string },
  }),
  remapGeoJson: route({
    path: "/geojson-maps/remap",
    method: "POST",
    body: {} as {
      adminAreaLevel: 2 | 3 | 4;
      remapping: Record<string, string>; // oldAreaId -> newAreaId
    },
  }),
  dhis2GetOrgUnitLevels: route({
    path: "/geojson-maps/dhis2/levels",
    method: "POST",
    body: {} as Dhis2Credentials,
    response: {} as {
      levels: Array<{ level: number; name: string; orgUnitCount: number }>;
    },
  }),
  dhis2DetectLevelMapping: route({
    path: "/geojson-maps/dhis2/detect-mapping",
    method: "POST",
    body: {} as Dhis2Credentials,
    response: {} as {
      mappings: Array<{
        adminAreaLevel: 2 | 3 | 4;
        adminAreaCount: number;
        dhis2Level: number | null;
        dhis2LevelName: string | null;
        dhis2Count: number | null;
        geometryCount: number | null;
        matchedNames: number;
        confidence: "high" | "medium" | "low" | "none";
      }>;
    },
  }),
  dhis2AnalyzeGeoJson: route({
    path: "/geojson-maps/dhis2/analyze",
    method: "POST",
    body: {} as Dhis2Credentials & { dhis2Level: number },
    response: {} as {
      properties: string[];
      sampleValues: Record<string, string[]>;
      featureCount: number;
      nullGeometryCount: number;
      dhis2Features: Dhis2FeatureContext[];
    },
  }),
  dhis2SaveGeoJsonMap: route({
    path: "/geojson-maps/dhis2/save",
    method: "POST",
    body: {} as Dhis2Credentials & {
      dhis2Level: number;
      adminAreaLevel: 2 | 3 | 4;
      areaMatchProp: string;
      areaMapping: Record<string, string>;
    },
  }),
} as const;
