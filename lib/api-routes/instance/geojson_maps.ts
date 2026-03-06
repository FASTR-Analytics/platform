import type { GeoJsonMapSummary } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

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
  getGeoJsonForLevel: route({
    path: "/geojson-maps/level/:level",
    method: "GET",
    params: {} as { level: string },
    response: {} as { geojson: string; uploadedAt: string },
  }),
} as const;
