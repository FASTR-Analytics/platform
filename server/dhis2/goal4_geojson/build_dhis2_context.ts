import { getDHIS2 } from "../common/base_fetcher.ts";
import type { Dhis2Credentials } from "lib";
import type { GeoJsonFeatureCollection, Dhis2FeatureContext, FetchOptions } from "./types.ts";

const PARENT_BATCH_SIZE = 50;

type OrgUnitNameResponse = {
  organisationUnits: Array<{ id: string; name: string }>;
};

async function fetchParentNames(
  credentials: Dhis2Credentials,
  parentUids: string[],
): Promise<Map<string, string>> {
  const nameMap = new Map<string, string>();
  if (parentUids.length === 0) return nameMap;

  const options: FetchOptions = { dhis2Credentials: credentials };

  for (let i = 0; i < parentUids.length; i += PARENT_BATCH_SIZE) {
    const batch = parentUids.slice(i, i + PARENT_BATCH_SIZE);
    const filterValue = batch.join(",");
    const params = new URLSearchParams({
      filter: `id:in:[${filterValue}]`,
      fields: "id,name",
      paging: "false",
    });

    const response = await getDHIS2<OrgUnitNameResponse>(
      "/api/organisationUnits.json",
      options,
      params,
    );

    if (response.organisationUnits) {
      for (const ou of response.organisationUnits) {
        nameMap.set(ou.id, ou.name);
      }
    }
  }

  return nameMap;
}

export async function buildDhis2Context(
  credentials: Dhis2Credentials,
  featureCollection: GeoJsonFeatureCollection,
): Promise<Dhis2FeatureContext[]> {
  const parentUids = new Set<string>();
  const features: Array<{
    uid: string;
    name: string;
    code: string | null;
    parentUid: string | null;
  }> = [];

  for (const feature of featureCollection.features) {
    if (feature.geometry === null) continue;

    const uid = typeof feature.id === "string" ? feature.id : String(feature.id ?? "");
    const props = feature.properties ?? {};
    const name = typeof props.name === "string" ? props.name : "";
    const code = typeof props.code === "string" ? props.code : null;
    const parentUid = typeof props.parent === "string" ? props.parent : null;

    if (parentUid) {
      parentUids.add(parentUid);
    }

    features.push({ uid, name, code, parentUid });
  }

  const parentNames = await fetchParentNames(credentials, Array.from(parentUids));

  return features.map((f) => ({
    uid: f.uid,
    name: f.name,
    code: f.code,
    parentUid: f.parentUid,
    parentName: f.parentUid ? (parentNames.get(f.parentUid) ?? null) : null,
  }));
}
