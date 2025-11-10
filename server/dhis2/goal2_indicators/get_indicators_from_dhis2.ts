/**
 * GOAL 2: Fetch and manage indicators from DHIS2
 *
 * This module provides functions to:
 * - Fetch data elements
 * - Fetch indicators
 * - Search for indicators by name/code
 * - Get indicator groups and group sets
 * - Map indicators to internal common indicators
 */

import type {
  DHIS2CategoryCombo,
  DHIS2DataElement,
  DHIS2DataElementGroup,
  DHIS2Indicator,
  DHIS2IndicatorGroup,
  DHIS2PagedResponse,
} from "lib";
import { getDHIS2, FetchOptions } from "../common/base_fetcher.ts";

// ============================================================================
// Data Elements Functions
// ============================================================================

const DEFAULT_DATA_ELEMENT_FIELDS = [
  "id",
  "name",
  "displayName",
  "code",
  "shortName",
  "aggregationType",
  "domainType",
  "valueType",
  "categoryCombo[id,name]",
  "dataElementGroups[id,name]",
  "created",
  "lastUpdated",
];

export async function getDataElementsFromDHIS2(
  options: FetchOptions,
  queryParams?: {
    fields?: string[];
    filter?: string[];
    pageSize?: number;
    paging?: boolean;
  }
): Promise<DHIS2DataElement[]> {
  const params = new URLSearchParams();

  // Add fields
  const fields = queryParams?.fields || DEFAULT_DATA_ELEMENT_FIELDS;
  params.set("fields", fields.join(","));

  // Add filters
  if (queryParams?.filter) {
    queryParams.filter.forEach((f) => params.append("filter", f));
  }

  // Add paging
  if (queryParams?.paging !== undefined) {
    params.set("paging", String(queryParams.paging));
  }

  if (queryParams?.pageSize) {
    params.set("pageSize", String(queryParams.pageSize));
  }

  const response = await getDHIS2<
    DHIS2PagedResponse<DHIS2DataElement> & { dataElements: DHIS2DataElement[] }
  >("/api/dataElements.json", options, params);

  return response.dataElements || [];
}

export async function getDataElementsFromDHIS2Paginated(
  options: FetchOptions,
  queryParams?: {
    fields?: string[];
    filter?: string[];
    pageSize?: number;
  },
  onProgress?: (current: number, total: number) => void
): Promise<DHIS2DataElement[]> {
  const pageSize = queryParams?.pageSize || 1000;
  const allDataElements: DHIS2DataElement[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams();

    // Add fields
    const fields = queryParams?.fields || DEFAULT_DATA_ELEMENT_FIELDS;
    params.set("fields", fields.join(","));

    // Add filters
    if (queryParams?.filter) {
      queryParams.filter.forEach((f) => params.append("filter", f));
    }

    // Add paging params
    params.set("paging", "true");
    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));

    const response = await getDHIS2<
      DHIS2PagedResponse<DHIS2DataElement> & {
        dataElements: DHIS2DataElement[];
      }
    >("/api/dataElements.json", options, params);

    if (response.dataElements) {
      allDataElements.push(...response.dataElements);
    }

    if (response.pager) {
      totalPages = response.pager.pageCount;
      if (onProgress) {
        onProgress(allDataElements.length, response.pager.total);
      }
    }

    currentPage++;
  } while (currentPage <= totalPages);

  return allDataElements;
}

export async function searchDataElementsFromDHIS2(
  options: FetchOptions,
  query: string,
  queryParams?: {
    fields?: string[];
    filter?: string[];
  }
): Promise<DHIS2DataElement[]> {
  const filter = [...(queryParams?.filter || []), `name:ilike:${query}`];

  return getDataElementsFromDHIS2(options, {
    ...queryParams,
    filter,
  });
}

export async function getDataElementGroupsFromDHIS2(
  options: FetchOptions,
  includeDataElements = false
): Promise<DHIS2DataElementGroup[]> {
  const fields = ["id", "name", "displayName", "code"];

  if (includeDataElements) {
    fields.push("dataElements[id,name]");
  }

  const params = new URLSearchParams();
  params.set("fields", fields.join(","));
  params.set("paging", "false");

  const response = await getDHIS2<{
    dataElementGroups: DHIS2DataElementGroup[];
  }>("/api/dataElementGroups.json", options, params);

  return response.dataElementGroups || [];
}

// ============================================================================
// Indicators Functions
// ============================================================================

const DEFAULT_INDICATOR_FIELDS = [
  "id",
  "name",
  "displayName",
  "code",
  "shortName",
  "numerator",
  "denominator",
  "annualized",
  "indicatorType[id,name,factor]",
  "indicatorGroups[id,name]",
  "created",
  "lastUpdated",
];

export async function getIndicatorsFromDHIS2(
  options: FetchOptions,
  queryParams?: {
    fields?: string[];
    filter?: string[];
    pageSize?: number;
    paging?: boolean;
  }
): Promise<DHIS2Indicator[]> {
  const params = new URLSearchParams();

  // Add fields
  const fields = queryParams?.fields || DEFAULT_INDICATOR_FIELDS;
  params.set("fields", fields.join(","));

  // Add filters
  if (queryParams?.filter) {
    queryParams.filter.forEach((f) => params.append("filter", f));
  }

  // Add paging
  if (queryParams?.paging !== undefined) {
    params.set("paging", String(queryParams.paging));
  }

  if (queryParams?.pageSize) {
    params.set("pageSize", String(queryParams.pageSize));
  }

  const response = await getDHIS2<
    DHIS2PagedResponse<DHIS2Indicator> & { indicators: DHIS2Indicator[] }
  >("/api/indicators.json", options, params);

  return response.indicators || [];
}

export async function getIndicatorsFromDHIS2Paginated(
  options: FetchOptions,
  queryParams?: {
    fields?: string[];
    filter?: string[];
    pageSize?: number;
  },
  onProgress?: (current: number, total: number) => void
): Promise<DHIS2Indicator[]> {
  const pageSize = queryParams?.pageSize || 1000;
  const allIndicators: DHIS2Indicator[] = [];
  let currentPage = 1;
  let totalPages = 1;

  do {
    const params = new URLSearchParams();

    // Add fields
    const fields = queryParams?.fields || DEFAULT_INDICATOR_FIELDS;
    params.set("fields", fields.join(","));

    // Add filters
    if (queryParams?.filter) {
      queryParams.filter.forEach((f) => params.append("filter", f));
    }

    // Add paging params
    params.set("paging", "true");
    params.set("page", String(currentPage));
    params.set("pageSize", String(pageSize));

    const response = await getDHIS2<
      DHIS2PagedResponse<DHIS2Indicator> & { indicators: DHIS2Indicator[] }
    >("/api/indicators.json", options, params);

    if (response.indicators) {
      allIndicators.push(...response.indicators);
    }

    if (response.pager) {
      totalPages = response.pager.pageCount;
      if (onProgress) {
        onProgress(allIndicators.length, response.pager.total);
      }
    }

    currentPage++;
  } while (currentPage <= totalPages);

  return allIndicators;
}

export async function searchIndicatorsFromDHIS2(
  options: FetchOptions,
  query: string,
  searchBy: "name" | "code" | "all" = "all"
): Promise<DHIS2Indicator[]> {
  let filter: string[];

  switch (searchBy) {
    case "name":
      filter = [`name:ilike:${query}`];
      break;
    case "code":
      filter = [`code:ilike:${query}`];
      break;
    case "all":
    default:
      // Search in both name and code
      filter = [`name:ilike:${query}`];
      // Note: DHIS2 doesn't support OR in filters directly,
      // so we'd need to make two requests and merge
      break;
  }

  return getIndicatorsFromDHIS2(options, { filter });
}

export async function getIndicatorGroupsFromDHIS2(
  options: FetchOptions,
  includeIndicators = false
): Promise<DHIS2IndicatorGroup[]> {
  const fields = ["id", "name", "displayName", "code"];

  if (includeIndicators) {
    fields.push("indicators[id,name]");
  }

  const params = new URLSearchParams();
  params.set("fields", fields.join(","));
  params.set("paging", "false");

  const response = await getDHIS2<{
    indicatorGroups: DHIS2IndicatorGroup[];
  }>("/api/indicatorGroups.json", options, params);

  return response.indicatorGroups || [];
}

// ============================================================================
// Category Combos Functions (useful for data elements)
// ============================================================================

export async function getCategoryCombosFromDHIS2(
  options: FetchOptions,
  includeDetails = false
): Promise<DHIS2CategoryCombo[]> {
  const fields = ["id", "name", "displayName", "code"];

  if (includeDetails) {
    fields.push("categories[id,name]");
    fields.push("categoryOptionCombos[id,name]");
  }

  const params = new URLSearchParams();
  params.set("fields", fields.join(","));
  params.set("paging", "false");

  const response = await getDHIS2<{
    categoryCombos: DHIS2CategoryCombo[];
  }>("/api/categoryCombos.json", options, params);

  return response.categoryCombos || [];
}

// ============================================================================
// Combined Search Function
// ============================================================================

export async function searchAllIndicatorsAndDataElements(
  options: FetchOptions,
  query: string,
  includeDataElements = true,
  includeIndicators = true
): Promise<{
  dataElements: DHIS2DataElement[];
  indicators: DHIS2Indicator[];
}> {
  const results: {
    dataElements: DHIS2DataElement[];
    indicators: DHIS2Indicator[];
  } = {
    dataElements: [],
    indicators: [],
  };

  // Parallel fetch both if requested
  const promises: Promise<any>[] = [];

  if (includeDataElements) {
    promises.push(
      searchDataElementsFromDHIS2(options, query).then(
        (de) => (results.dataElements = de)
      )
    );
  }

  if (includeIndicators) {
    promises.push(
      searchIndicatorsFromDHIS2(options, query).then(
        (ind) => (results.indicators = ind)
      )
    );
  }

  await Promise.all(promises);

  return results;
}

// ============================================================================
// Test Connection Function
// ============================================================================

export async function testIndicatorsConnection(options: FetchOptions): Promise<{
  success: boolean;
  message: string;
  details?: {
    dataElementCount?: number;
    indicatorCount?: number;
    dataElementGroups?: number;
    indicatorGroups?: number;
  };
}> {
  try {
    // Test data elements endpoint
    const deParams = new URLSearchParams();
    deParams.set("fields", "id");
    deParams.set("pageSize", "1");
    deParams.set("paging", "true");

    const dataElements = await getDHIS2<DHIS2PagedResponse<DHIS2DataElement>>(
      "/api/dataElements.json",
      options,
      deParams
    );

    // Test indicators endpoint
    const indParams = new URLSearchParams();
    indParams.set("fields", "id");
    indParams.set("pageSize", "1");
    indParams.set("paging", "true");

    const indicators = await getDHIS2<DHIS2PagedResponse<DHIS2Indicator>>(
      "/api/indicators.json",
      options,
      indParams
    );

    // Get counts for groups
    const deGroups = await getDataElementGroupsFromDHIS2(options);
    const indGroups = await getIndicatorGroupsFromDHIS2(options);

    return {
      success: true,
      message: "Successfully connected to DHIS2 indicators API",
      details: {
        dataElementCount: dataElements.pager?.total,
        indicatorCount: indicators.pager?.total,
        dataElementGroups: deGroups.length,
        indicatorGroups: indGroups.length,
      },
    };
  } catch (error) {
    return {
      success: false,
      message: `Failed to connect to DHIS2 indicators API: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}
