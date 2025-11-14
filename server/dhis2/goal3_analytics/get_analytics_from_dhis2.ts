/**
 * Enhanced DHIS2 Analytics API fetcher
 * Improved version with better error handling, batching support, and generic types
 */

import { getDHIS2, FetchOptions } from "../common/base_fetcher.ts";

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
  const dxItems = [
    ...(params.dataElements || []),
    ...(params.indicators || [])
  ];

  if (dxItems.length === 0) {
    throw new Error("Analytics request requires at least one data element or indicator");
  }

  if (!params.orgUnits || params.orgUnits.length === 0) {
    throw new Error("Analytics request requires at least one organization unit");
  }

  if (!params.periods || params.periods.length === 0) {
    throw new Error("Analytics request requires at least one period");
  }

  const searchParams = new URLSearchParams();

  // Build dimensions - maintain dx, pe, ou order for compatibility
  const dimensions: string[] = [];

  // Data elements and indicators (dx dimension) - combine into single dimension
  dimensions.push(`dimension=dx:${dxItems.join(";")}`);

  
  // Periods (pe dimension) - comes before ou for compatibility
  dimensions.push(`dimension=pe:${params.periods.join(";")}`);

  // Organization units (ou dimension)
  dimensions.push(`dimension=ou:${params.orgUnits.join(";")}`);

  
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

  return getDHIS2<DHIS2AnalyticsResponse<T>>(
    "/api/analytics.json",
    options,
    searchParams
  );
}