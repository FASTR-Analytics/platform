/**
 * GOAL 2: Fetch and manage indicators from DHIS2
 *
 * This module provides functions to:
 * - Fetch data elements
 * - Fetch indicators
 * - Search for indicators by name/code
 * - Get indicator groups and group sets
 */

import type {
  DHIS2CategoryCombo,
  DHIS2DataElement,
  DHIS2DataElementGroup,
  DHIS2Indicator,
  DHIS2IndicatorGroup,
  DHIS2PagedResponse,
} from "lib";
import {
  getDHIS2,
  FetchOptions,
} from "../common/base_fetcher.ts";

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
  "categoryCombo[id,name,isDefault,categoryOptionCombos[id,name,displayName]]",
  "dataElementGroups[id,name]",
  "dataSetElements[dataSet[id,periodType]]",
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
    rootJunction?: "AND" | "OR";
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

  // Add rootJunction for OR queries
  if (queryParams?.rootJunction) {
    params.set("rootJunction", queryParams.rootJunction);
  }

  // Add paging
  if (queryParams?.paging !== undefined) {
    params.set("paging", String(queryParams.paging));
  }

  if (queryParams?.pageSize) {
    params.set("pageSize", String(queryParams.pageSize));
  }

  const response = await getDHIS2<
    DHIS2PagedResponse & { dataElements: DHIS2DataElement[] }
  >("/api/dataElements.json", options, params);

  return response.dataElements || [];
}

export async function searchDataElementsFromDHIS2(
  options: FetchOptions,
  query: string,
  queryParams?: {
    fields?: string[];
    filter?: string[];
    rootJunction?: "AND" | "OR";
  }
): Promise<DHIS2DataElement[]> {
  const searchFilters = [
    `name:ilike:${query}`,
    `code:ilike:${query}`,
    `id:ilike:${query}`,
  ];

  const filter = [...(queryParams?.filter || []), ...searchFilters];

  return getDataElementsFromDHIS2(options, {
    ...queryParams,
    filter,
    rootJunction: "OR",
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
    rootJunction?: "AND" | "OR";
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

  // Add rootJunction for OR queries
  if (queryParams?.rootJunction) {
    params.set("rootJunction", queryParams.rootJunction);
  }

  // Add paging
  if (queryParams?.paging !== undefined) {
    params.set("paging", String(queryParams.paging));
  }

  if (queryParams?.pageSize) {
    params.set("pageSize", String(queryParams.pageSize));
  }

  const response = await getDHIS2<
    DHIS2PagedResponse & { indicators: DHIS2Indicator[] }
  >("/api/indicators.json", options, params);

  return response.indicators || [];
}

export async function searchIndicatorsFromDHIS2(
  options: FetchOptions,
  query: string
): Promise<DHIS2Indicator[]> {
  const filter = [
    `name:ilike:${query}`,
    `code:ilike:${query}`,
    `id:ilike:${query}`,
  ];

  return getIndicatorsFromDHIS2(options, { filter, rootJunction: "OR" });
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
// Combined Search Function
// ============================================================================

async function searchSingleTerm(
  options: FetchOptions,
  term: string,
  includeDataElements: boolean,
  includeIndicators: boolean
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

  const promises: Promise<any>[] = [];

  if (includeDataElements) {
    promises.push(
      searchDataElementsFromDHIS2(options, term).then(
        (de) => (results.dataElements = de)
      )
    );
  }

  if (includeIndicators) {
    promises.push(
      searchIndicatorsFromDHIS2(options, term).then(
        (ind) => (results.indicators = ind)
      )
    );
  }

  await Promise.all(promises);
  return results;
}

export async function searchAllIndicatorsAndDataElements(
  options: FetchOptions,
  query: string,
  includeDataElements: boolean,
  includeIndicators: boolean
): Promise<{
  dataElements: DHIS2DataElement[];
  indicators: DHIS2Indicator[];
}> {
  // Split by comma, semicolon, or newline and trim
  const terms = query
    .split(/[,;\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  if (terms.length === 0) {
    return { dataElements: [], indicators: [] };
  }

  // Search all terms in parallel
  const allResults = await Promise.all(
    terms.map((term) =>
      searchSingleTerm(options, term, includeDataElements, includeIndicators)
    )
  );

  // Merge and dedupe by id
  const seenDataElements = new Set<string>();
  const seenIndicators = new Set<string>();
  const dataElements: DHIS2DataElement[] = [];
  const indicators: DHIS2Indicator[] = [];

  for (const result of allResults) {
    for (const de of result.dataElements) {
      if (!seenDataElements.has(de.id)) {
        seenDataElements.add(de.id);
        dataElements.push(de);
      }
    }
    for (const ind of result.indicators) {
      if (!seenIndicators.has(ind.id)) {
        seenIndicators.add(ind.id);
        indicators.push(ind);
      }
    }
  }

  return { dataElements, indicators };
}
