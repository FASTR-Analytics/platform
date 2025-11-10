import { getDHIS2 } from "../common/base_fetcher.ts";
import type { 
  FetchOptions,
  DHIS2OrgUnit,
  DHIS2PagedResponse,
  ProgressCallback,
  BatchProcessor
} from "./types.ts";

const DEFAULT_ORG_UNIT_FIELDS = [
  "id",
  "name", 
  "displayName",
  "shortName",
  "code",
  "level",
  "path",
  "parent[id,name]",
  "coordinates",
  "openingDate",
  "closedDate",
  "comment",
  "featureType"
];

/**
 * Stream organization units with level and path filtering
 * Processes results in batches to avoid memory issues
 */
export async function streamOrgUnitsByLevel(
  options: FetchOptions,
  config: {
    selectedLevels?: number[]; // Only fetch these specific levels
    batchSize?: number;
  },
  onBatch: BatchProcessor<DHIS2OrgUnit>,
  onProgress?: ProgressCallback
): Promise<void> {
  const batchSize = config.batchSize || 1000;
  
  // Build filters
  const filters: string[] = [];
  
  if (config.selectedLevels && config.selectedLevels.length > 0) {
    // Filter to only the selected levels
    if (config.selectedLevels.length === 1) {
      filters.push(`level:eq:${config.selectedLevels[0]}`);
    } else {
      // Multiple levels - use OR logic with level:in filter if supported, 
      // otherwise use multiple level:eq filters
      config.selectedLevels.forEach(level => {
        filters.push(`level:eq:${level}`);
      });
    }
  }

  // First get total count for progress reporting
  const countParams = new URLSearchParams();
  countParams.set("fields", "id");
  countParams.set("pageSize", "1");
  countParams.set("totalPages", "true");
  
  if (filters.length > 0) {
    filters.forEach(filter => countParams.append("filter", filter));
  }

  const countResponse = await getDHIS2<DHIS2PagedResponse<{ id: string }>>(
    "/api/organisationUnits.json",
    options,
    countParams
  );

  const totalCount = countResponse.pager?.total || 0;
  
  onProgress?.(0, totalCount, "Starting org unit fetch...");

  // Stream in batches
  let currentPage = 1;
  let processedCount = 0;

  while (true) {
    const params = new URLSearchParams();
    params.set("fields", DEFAULT_ORG_UNIT_FIELDS.join(","));
    params.set("pageSize", String(batchSize));
    params.set("page", String(currentPage));
    params.set("paging", "true");
    
    if (filters.length > 0) {
      filters.forEach(filter => params.append("filter", filter));
    }

    const response = await getDHIS2<DHIS2PagedResponse<DHIS2OrgUnit> & { 
      organisationUnits: DHIS2OrgUnit[] 
    }>("/api/organisationUnits.json", options, params);

    if (!response.organisationUnits || response.organisationUnits.length === 0) {
      break; // No more data
    }

    // Process this batch
    await onBatch(response.organisationUnits);
    
    processedCount += response.organisationUnits.length;
    onProgress?.(processedCount, totalCount, `Processed ${processedCount}/${totalCount} org units`);

    // Check if we're done
    if (!response.pager || currentPage >= response.pager.pageCount) {
      break;
    }

    currentPage++;
    
    // Small delay between batches to prevent overwhelming DHIS2 server
    if (currentPage <= response.pager.pageCount) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  onProgress?.(processedCount, totalCount, "Completed org unit fetch");
}

/**
 * Helper to build DHIS2 path filters from org unit selection
 */
export function buildPathFilters(orgUnitIds: string[], includeDescendants: boolean): string[] {
  if (!includeDescendants) {
    // Only the selected org units themselves
    return orgUnitIds.map(id => `id:eq:${id}`);
  }
  
  // Include descendants - use path filter
  return orgUnitIds.map(id => `path:like:/${id}`);
}

/**
 * Simple non-streaming fetch for small result sets
 */
export async function getOrgUnitsByLevel(
  options: FetchOptions,
  maxLevel?: number,
  parentPaths?: string[]
): Promise<DHIS2OrgUnit[]> {
  const params = new URLSearchParams();
  params.set("fields", DEFAULT_ORG_UNIT_FIELDS.join(","));
  params.set("paging", "false");

  if (maxLevel) {
    params.append("filter", `level:le:${maxLevel}`);
  }

  if (parentPaths && parentPaths.length > 0) {
    parentPaths.forEach(path => {
      params.append("filter", `path:like:${path}`);
    });
  }

  const response = await getDHIS2<{
    organisationUnits: DHIS2OrgUnit[];
  }>("/api/organisationUnits.json", options, params);

  return response.organisationUnits || [];
}