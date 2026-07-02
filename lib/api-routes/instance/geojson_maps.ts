import { z } from "zod";
import type { GeoJsonMapSummary } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

type Dhis2FeatureContext = {
  uid: string;
  name: string;
  code: string | null;
  parentUid: string | null;
  parentName: string | null;
};

const dhis2CredentialsSchema = z.object({
  url: z.string(),
  username: z.string(),
  password: z.string(),
});

const levelParamsSchema = z.object({ level: z.coerce.number() });
const adminAreaLevelSchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);

export const geojsonMapRouteRegistry = {
  getGeoJsonMaps: route({
    path: "/geojson-maps",
    method: "GET",
    response: {} as GeoJsonMapSummary[],
  }),
  analyzeGeoJsonUpload: route({
    path: "/geojson-maps/analyze",
    method: "POST",
    body: z.object({ assetFileName: z.string() }),
    response: {} as {
      properties: string[];
      sampleValues: Record<string, string[]>;
      featureCount: number;
    },
  }),
  saveGeoJsonMap: route({
    path: "/geojson-maps/save",
    method: "POST",
    body: z.object({
      adminAreaLevel: adminAreaLevelSchema,
      assetFileName: z.string(),
      areaMatchProp: z.string(),
      areaMapping: z.record(z.string(), z.string()),
    }),
  }),
  deleteGeoJsonMap: route({
    path: "/geojson-maps/delete",
    method: "POST",
    // adminAreaLevel stays a plain number: the delete handler has no 2|3|4 guard and the
    // client sources this from `number`-typed map summaries. Tightening belongs with a
    // GeoJsonMapSummary type change, not here.
    body: z.object({ adminAreaLevel: z.number() }),
  }),
  getAdminAreaOptionsForLevel: route({
    path: "/geojson-maps/admin-area-options/:level",
    method: "GET",
    params: levelParamsSchema,
    response: {} as Array<{ value: string; label: string }>,
  }),
  getGeoJsonForLevel: route({
    path: "/geojson-maps/level/:level",
    method: "GET",
    params: levelParamsSchema,
    response: {} as { geojson: string; uploadedAt: string },
  }),
  remapGeoJson: route({
    path: "/geojson-maps/remap",
    method: "POST",
    body: z.object({
      adminAreaLevel: adminAreaLevelSchema,
      remapping: z.record(z.string(), z.string()),
    }),
  }),
  dhis2GetOrgUnitLevels: route({
    path: "/geojson-maps/dhis2/levels",
    method: "POST",
    body: dhis2CredentialsSchema,
    response: {} as {
      levels: Array<{ level: number; name: string; orgUnitCount: number }>;
    },
  }),
  dhis2AnalyzeGeoJson: route({
    path: "/geojson-maps/dhis2/analyze",
    method: "POST",
    body: dhis2CredentialsSchema.extend({ dhis2Level: z.number() }),
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
    body: dhis2CredentialsSchema.extend({
      dhis2Level: z.number(),
      adminAreaLevel: adminAreaLevelSchema,
      areaMatchProp: z.string(),
      areaMapping: z.record(z.string(), z.string()),
    }),
  }),
} as const;
