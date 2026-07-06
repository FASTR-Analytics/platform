import { fetchFromDHIS2, buildUrl } from "../common/base_fetcher.ts";
import type { Dhis2Credentials } from "lib";
import type { GeoJsonFeatureCollection } from "./types.ts";

// The heavy fetch: full-resolution boundaries for every org unit at a level —
// ~20 MB / up to ~43 s for a 200-district country. Callers pass the timeout
// and retry budget explicitly: the save path uses a generous timeout and
// maxAttempts 1, because retrying a transient failure would re-download the
// whole payload each attempt (the shared fetcher defaults to 5 attempts).
export async function fetchOrgUnitsGeoJsonForLevel(
  credentials: Dhis2Credentials,
  dhis2Level: number,
  options: { timeoutMs: number; maxAttempts: number },
): Promise<GeoJsonFeatureCollection> {
  const url = buildUrl(
    `/api/organisationUnits.geojson`,
    credentials.url,
    { level: String(dhis2Level) },
  );

  const result = await fetchFromDHIS2<GeoJsonFeatureCollection>(url, {
    dhis2Credentials: credentials,
    timeout: options.timeoutMs,
    retryOptions: { maxAttempts: options.maxAttempts },
    headers: {
      Accept: "application/json+geojson",
    },
  });

  if (result.type !== "FeatureCollection" || !Array.isArray(result.features)) {
    throw new Error("Invalid GeoJSON response from DHIS2: expected a FeatureCollection");
  }

  return result;
}
