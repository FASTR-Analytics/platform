import { fetchFromDHIS2, buildUrl } from "../common/base_fetcher.ts";
import type { Dhis2Credentials } from "lib";
import type { GeoJsonFeatureCollection } from "./types.ts";

const FETCH_TIMEOUT = 60000; // 60 seconds

export async function fetchOrgUnitsGeoJsonForLevel(
  credentials: Dhis2Credentials,
  dhis2Level: number,
): Promise<GeoJsonFeatureCollection> {
  const url = buildUrl(
    `/api/organisationUnits.geojson`,
    credentials.url,
    { level: String(dhis2Level) },
  );

  const result = await fetchFromDHIS2<GeoJsonFeatureCollection>(url, {
    dhis2Credentials: credentials,
    timeout: FETCH_TIMEOUT,
    headers: {
      Accept: "application/json+geojson",
    },
  });

  if (result.type !== "FeatureCollection" || !Array.isArray(result.features)) {
    throw new Error("Invalid GeoJSON response from DHIS2: expected a FeatureCollection");
  }

  return result;
}
