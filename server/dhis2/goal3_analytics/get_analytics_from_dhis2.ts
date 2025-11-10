/**
 * Enhanced DHIS2 Analytics API fetcher
 * Improved version with better error handling, batching support, and generic types
 */

import { getDHIS2, checkUrlLength, FetchOptions } from "../common/base_fetcher.ts";
import { RetryOptions } from "../common/retry_utils.ts";

// Generic analytics response that can handle different dimensions
export interface DHIS2AnalyticsResponse<T = any> {
  headers: Array<{
    name: string;
    column: string;
    type: string;
    meta?: boolean;
  }>;
  metaData: {
    dimensions: Record<string, string[]>;
    items: Record<string, { name: string }>;
  };
  rows: T[];
  height?: number;
  width?: number;
}

export interface AnalyticsParams {
  dataElements?: string[];
  indicators?: string[];
  orgUnits?: string[];
  periods?: string[];
  filter?: string[];
  aggregationType?: string;
  skipMeta?: boolean;
  skipData?: boolean;
  hierarchyMeta?: boolean;
  showHierarchy?: boolean;
  displayProperty?: "NAME" | "SHORTNAME";
  outputIdScheme?: "UID" | "CODE" | "NAME";
}

/**
 * Fetch analytics data from DHIS2
 * Supports both data elements and indicators
 */
export async function getAnalyticsFromDHIS2<T = string[]>(
  params: AnalyticsParams,
  options: FetchOptions
): Promise<DHIS2AnalyticsResponse<T>> {
  const searchParams = new URLSearchParams();
  
  // Build dimensions - maintain dx, pe, ou order for compatibility
  const dimensions: string[] = [];
  
  // Data elements and indicators (dx dimension)
  if (params.dataElements && params.dataElements.length > 0) {
    dimensions.push(`dimension=dx:${params.dataElements.join(";")}`);
  }
  
  if (params.indicators && params.indicators.length > 0) {
    dimensions.push(`dimension=dx:${params.indicators.join(";")}`);
  }
  
  // Periods (pe dimension) - comes before ou for compatibility
  if (params.periods && params.periods.length > 0) {
    dimensions.push(`dimension=pe:${params.periods.join(";")}`);
  }
  
  // Organization units (ou dimension)
  if (params.orgUnits && params.orgUnits.length > 0) {
    dimensions.push(`dimension=ou:${params.orgUnits.join(";")}`);
  }
  
  // Add dimensions to params
  dimensions.forEach(dim => {
    const [key, value] = dim.split("=");
    searchParams.append(key, value);
  });
  
  // Add filters
  if (params.filter) {
    params.filter.forEach(f => searchParams.append("filter", f));
  }
  
  // Add other parameters
  if (params.aggregationType) {
    searchParams.set("aggregationType", params.aggregationType);
  }
  
  if (params.skipMeta) {
    searchParams.set("skipMeta", "true");
  }
  
  if (params.skipData) {
    searchParams.set("skipData", "true");
  }
  
  if (params.hierarchyMeta) {
    searchParams.set("hierarchyMeta", "true");
  }
  
  if (params.showHierarchy) {
    searchParams.set("showHierarchy", "true");
  }
  
  if (params.displayProperty) {
    searchParams.set("displayProperty", params.displayProperty);
  }
  
  if (params.outputIdScheme) {
    searchParams.set("outputIdScheme", params.outputIdScheme);
  }
  
  // Check URL length
  const url = `/api/analytics.json?${searchParams.toString()}`;
  checkUrlLength(url, 2048);
  
  return getDHIS2<DHIS2AnalyticsResponse<T>>(
    "/api/analytics.json",
    options,
    searchParams
  );
}

/**
 * Batch large analytics requests
 * Splits large requests into smaller chunks and combines results
 */
export async function getAnalyticsBatched<T = string[]>(
  params: AnalyticsParams,
  batchSize = 50,
  options: FetchOptions
): Promise<DHIS2AnalyticsResponse<T>> {
  const orgUnits = params.orgUnits || [];
  
  if (orgUnits.length <= batchSize) {
    // Small enough to fetch in one request
    return getAnalyticsFromDHIS2<T>(params, options);
  }
  
  // Split into batches
  const batches: string[][] = [];
  for (let i = 0; i < orgUnits.length; i += batchSize) {
    batches.push(orgUnits.slice(i, i + batchSize));
  }
  
  console.log(`Fetching analytics in ${batches.length} batches of ${batchSize} org units`);
  
  // Fetch all batches
  const batchPromises = batches.map((batch, index) => {
    const batchParams = { ...params, orgUnits: batch };
    
    // Add delay between batches to avoid rate limiting
    const delay = index * 100; // 100ms between each batch start
    return new Promise<DHIS2AnalyticsResponse<T>>((resolve) => {
      setTimeout(async () => {
        console.log(`  Fetching batch ${index + 1}/${batches.length}`);
        const result = await getAnalyticsFromDHIS2<T>(batchParams, options);
        resolve(result);
      }, delay);
    });
  });
  
  const results = await Promise.all(batchPromises);
  
  // Combine results
  if (results.length === 0) {
    throw new Error("No results from batched analytics request");
  }
  
  const combined = results[0];
  for (let i = 1; i < results.length; i++) {
    combined.rows.push(...results[i].rows);
  }
  
  console.log(`Combined ${results.length} batches into ${combined.rows.length} total rows`);
  
  return combined;
}

/**
 * Get analytics data with automatic retry and batching
 * This is the recommended function for most use cases
 */
export async function getAnalyticsWithRetry<T = string[]>(
  params: AnalyticsParams,
  retryOptions?: RetryOptions,
  batchSize?: number,
  dhis2Credentials: {
    url: string;
    username: string;
    password: string;
  }
): Promise<DHIS2AnalyticsResponse<T>> {
  const fetchOptions: FetchOptions = {
    retryOptions: retryOptions || {
      maxAttempts: 10,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
    },
    logRequest: true,
    logResponse: true,
    dhis2Credentials,
  };
  
  // Use batching if we have many org units
  const orgUnitCount = params.orgUnits?.length || 0;
  const shouldBatch = batchSize && orgUnitCount > batchSize;
  
  if (shouldBatch) {
    return getAnalyticsBatched<T>(params, batchSize, fetchOptions);
  } else {
    return getAnalyticsFromDHIS2<T>(params, fetchOptions);
  }
}

/**
 * Helper to extract data values from analytics response
 */
export function extractDataValues(
  response: DHIS2AnalyticsResponse
): Array<{
  dataElement: string;
  orgUnit: string;
  period: string;
  value: string;
}> {
  const dxIndex = response.headers.findIndex(h => h.name === "dx");
  const ouIndex = response.headers.findIndex(h => h.name === "ou");
  const peIndex = response.headers.findIndex(h => h.name === "pe");
  const valueIndex = response.headers.findIndex(h => h.name === "value");
  
  return response.rows.map(row => ({
    dataElement: row[dxIndex],
    orgUnit: row[ouIndex],
    period: row[peIndex],
    value: row[valueIndex],
  }));
}