import { getDHIS2 } from "../common/base_fetcher.ts";
import type { Dhis2Credentials } from "lib";
import type { Dhis2FeatureContext } from "./types.ts";

type OrgUnitMetadataResponse = {
  organisationUnits?: Array<{
    id: string;
    name?: string;
    code?: string;
    parent?: { id?: string; name?: string };
  }>;
};

// Geometry-less metadata for one level — the analyze-side replacement for the
// full .geojson pull (a 200-district country is ~20 MB of polygons but ~17 KB
// of metadata). parent[id,name] comes inline, so no follow-up parent-name
// fetches are needed.
export async function fetchOrgUnitsMetadataForLevel(
  credentials: Dhis2Credentials,
  dhis2Level: number,
): Promise<Dhis2FeatureContext[]> {
  const params = new URLSearchParams({
    level: String(dhis2Level),
    fields: "id,name,code,parent[id,name]",
    paging: "false",
  });
  const response = await getDHIS2<OrgUnitMetadataResponse>(
    "/api/organisationUnits.json",
    { dhis2Credentials: credentials },
    params,
  );
  if (!Array.isArray(response.organisationUnits)) {
    throw new Error("Invalid response from DHIS2: expected organisationUnits");
  }
  return response.organisationUnits.map((ou) => ({
    uid: ou.id,
    name: typeof ou.name === "string" ? ou.name : "",
    code: typeof ou.code === "string" && ou.code !== "" ? ou.code : null,
    parentUid: ou.parent?.id ?? null,
    parentName: ou.parent?.name ?? null,
  }));
}

// Exact count of org units WITH stored geometry at a level, without
// downloading any coordinates (~1 KB response). `level` MUST be expressed as
// a filter — DHIS2 ignores a bare `level=` param when `filter=` is present
// (verified live on 2.40.11.1). `featureType` is absent from the fields
// projection on 2.40, so this filter count is the geometry-presence signal.
export async function fetchGeometryCountForLevel(
  credentials: Dhis2Credentials,
  dhis2Level: number,
): Promise<number> {
  const params = new URLSearchParams();
  params.append("filter", `level:eq:${dhis2Level}`);
  params.append("filter", "geometry:!null");
  params.append("fields", "id");
  params.append("pageSize", "1");
  const response = await getDHIS2<{ pager?: { total?: number } }>(
    "/api/organisationUnits.json",
    { dhis2Credentials: credentials },
    params,
  );
  const total = response.pager?.total;
  if (typeof total !== "number") {
    throw new Error("Invalid response from DHIS2: missing pager total");
  }
  return total;
}
