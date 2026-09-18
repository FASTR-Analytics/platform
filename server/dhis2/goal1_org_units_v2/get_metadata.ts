import { getDHIS2 } from "../common/base_fetcher.ts";
import type {
  Dhis2OrgUnitLevel,
  Dhis2RootOrgUnit,
  FetchOptions,
  OrgUnitMetadata,
} from "./types.ts";

// Unvalidated JSON from an external server: every field may be missing or
// null, whatever the DHIS2 docs promise.
type OrgUnitLevelsResponse = {
  organisationUnitLevels:
    | Array<{
      name: string | null | undefined;
      displayName: string | null | undefined;
      level: number | null | undefined;
    }>
    | null
    | undefined;
};

type OrgUnitLevelCountsResponse = {
  organisationUnits: Array<{ level: number | null | undefined }> | null | undefined;
};

type RootOrgUnitsResponse = {
  organisationUnits:
    | Array<{
      id: string | null | undefined;
      name: string | null | undefined;
      displayName: string | null | undefined;
      level: number | null | undefined;
      children: unknown[] | null | undefined;
    }>
    | null
    | undefined;
};

// A level with no number cannot be selected or counted and is dropped.
export async function getOrgUnitLevels(
  options: FetchOptions,
): Promise<Dhis2OrgUnitLevel[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName,level");
  params.set("paging", "false");
  const response = await getDHIS2<OrgUnitLevelsResponse>(
    "/api/organisationUnitLevels.json",
    options,
    params,
  );
  return (response.organisationUnitLevels ?? []).flatMap((l) =>
    typeof l.level !== "number" ? [] : [{
      level: l.level,
      name: l.name ?? "",
      displayName: l.displayName || l.name || "",
    }]
  );
}

export async function getOrgUnitCountsByLevel(
  options: FetchOptions,
): Promise<Map<number, number>> {
  const params = new URLSearchParams();
  params.set("fields", "id,level");
  params.set("paging", "false");
  const response = await getDHIS2<OrgUnitLevelCountsResponse>(
    "/api/organisationUnits.json",
    options,
    params,
  );
  const levelCounts = new Map<number, number>();
  for (const ou of response.organisationUnits ?? []) {
    if (typeof ou.level === "number") {
      levelCounts.set(ou.level, (levelCounts.get(ou.level) ?? 0) + 1);
    }
  }
  return levelCounts;
}

// Level 1 is taken as the root. A unit with no id or no level is dropped.
export async function getRootOrgUnits(
  options: FetchOptions,
): Promise<Dhis2RootOrgUnit[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName,level,children[id]");
  params.set("filter", "level:eq:1");
  params.set("paging", "false");
  const response = await getDHIS2<RootOrgUnitsResponse>(
    "/api/organisationUnits.json",
    options,
    params,
  );
  return (response.organisationUnits ?? []).flatMap((ou) =>
    ou.id == null || typeof ou.level !== "number" ? [] : [{
      id: ou.id,
      name: ou.name ?? "",
      displayName: ou.displayName || ou.name || "",
      level: ou.level,
      childrenCount: ou.children?.length ?? 0,
    }]
  );
}

export async function getOrgUnitMetadata(
  options: FetchOptions,
): Promise<OrgUnitMetadata> {
  const [levels, levelCounts, rootOrgUnits] = await Promise.all([
    getOrgUnitLevels(options),
    getOrgUnitCountsByLevel(options),
    getRootOrgUnits(options),
  ]);
  const totalOrgUnits = Array.from(levelCounts.values()).reduce(
    (sum, count) => sum + count,
    0,
  );
  return {
    levels: levels.map((level) => ({
      ...level,
      count: levelCounts.get(level.level) ?? 0,
    })),
    rootOrgUnits,
    summary: {
      totalOrgUnits,
      maxLevel: levelCounts.size > 0 ? Math.max(...levelCounts.keys()) : 0,
    },
  };
}
