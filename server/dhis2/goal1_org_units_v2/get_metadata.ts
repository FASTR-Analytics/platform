import { getDHIS2 } from "../common/base_fetcher.ts";
import type { 
  FetchOptions,
  DHIS2OrgUnit,
  DHIS2OrgUnitLevel,
  DHIS2PagedResponse,
  OrgUnitMetadata
} from "./types.ts";

/**
 * Get organization unit level definitions from DHIS2
 */
export async function getOrgUnitLevels(
  options: FetchOptions
): Promise<DHIS2OrgUnitLevel[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName,level");
  params.set("paging", "false");

  const response = await getDHIS2<{
    organisationUnitLevels: DHIS2OrgUnitLevel[];
  }>("/api/organisationUnitLevels.json", options, params);

  return response.organisationUnitLevels || [];
}

/**
 * Get counts of org units by level using efficient metadata queries
 */
export async function getOrgUnitCountsByLevel(
  options: FetchOptions
): Promise<Map<number, number>> {
  // First get a sample to determine total count and max level
  const sampleParams = new URLSearchParams();
  sampleParams.set("fields", "id,level");
  sampleParams.set("pageSize", "10000"); // Get reasonable sample
  sampleParams.set("paging", "false");

  const response = await getDHIS2<{
    organisationUnits: Array<{ id: string; level: number }>;
  }>("/api/organisationUnits.json", options, sampleParams);

  // Count by level
  const levelCounts = new Map<number, number>();
  
  if (response.organisationUnits) {
    for (const ou of response.organisationUnits) {
      const current = levelCounts.get(ou.level) || 0;
      levelCounts.set(ou.level, current + 1);
    }
  }

  return levelCounts;
}

/**
 * Get only the root organization units (top of hierarchy)
 */
export async function getRootOrgUnits(
  options: FetchOptions
): Promise<DHIS2OrgUnit[]> {
  const params = new URLSearchParams();
  params.set("fields", "id,name,displayName,level,children[id]");
  params.set("filter", "level:eq:1"); // Assume level 1 is always root
  params.set("paging", "false");

  const response = await getDHIS2<{
    organisationUnits: DHIS2OrgUnit[];
  }>("/api/organisationUnits.json", options, params);

  return response.organisationUnits || [];
}

/**
 * Get complete metadata for organization units structure (levels only)
 */
export async function getOrgUnitMetadata(
  options: FetchOptions
): Promise<OrgUnitMetadata> {
  // Fetch all metadata in parallel
  const [levels, levelCounts, rootUnits] = await Promise.all([
    getOrgUnitLevels(options),
    getOrgUnitCountsByLevel(options),
    getRootOrgUnits(options)
  ]);

  // Build response format
  const levelsWithCounts = levels.map(level => ({
    level: level.level,
    name: level.name,
    displayName: level.displayName || level.name,
    count: levelCounts.get(level.level) || 0
  }));

  const rootUnitsWithCounts = rootUnits.map(root => ({
    id: root.id,
    name: root.name,
    displayName: root.displayName || root.name,
    level: root.level,
    childrenCount: root.children?.length || 0
  }));

  const totalOrgUnits = Array.from(levelCounts.values()).reduce((sum, count) => sum + count, 0);
  const maxLevel = Math.max(...levelCounts.keys());

  return {
    levels: levelsWithCounts,
    rootOrgUnits: rootUnitsWithCounts,
    summary: {
      totalOrgUnits,
      maxLevel
    }
  };
}