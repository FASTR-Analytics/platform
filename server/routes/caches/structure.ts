import type { OrgUnitHierarchy } from "../../dhis2/goal1_org_units_v2/types.ts";

// Singleton cache for DHIS2 org unit hierarchy
// Since structure uploads use a singleton pattern, cache should too
let structureDhis2Cache: OrgUnitHierarchy | undefined = undefined;

// Timer for auto-cleanup
let cacheTimer: number | undefined = undefined;

/**
 * Cache a DHIS2 org unit hierarchy for structure upload
 */
export function setStructureCache(hierarchy: OrgUnitHierarchy): void {
  // Clear any existing timer
  if (cacheTimer) {
    clearTimeout(cacheTimer);
  }

  // Set new cache entry
  structureDhis2Cache = hierarchy;

  // Auto-delete after 1 hour
  cacheTimer = setTimeout(() => {
    structureDhis2Cache = undefined;
    cacheTimer = undefined;
    console.log("Structure cache expired");
  }, 60 * 60 * 1000); // 1 hour
}

/**
 * Get cached DHIS2 org unit hierarchy
 */
export function getStructureCache(): OrgUnitHierarchy | undefined {
  return structureDhis2Cache;
}

/**
 * Clear cached DHIS2 org unit hierarchy
 */
export function clearStructureCache(): void {
  structureDhis2Cache = undefined;

  if (cacheTimer) {
    clearTimeout(cacheTimer);
    cacheTimer = undefined;
  }
}

/**
 * Get cache statistics (for debugging)
 */
export function getStructureCacheStats(): {
  isCached: boolean;
  orgUnitCount?: number;
} {
  return {
    isCached: structureDhis2Cache !== undefined,
    orgUnitCount: structureDhis2Cache?.orgUnits.size,
  };
}