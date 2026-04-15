// ============================================================================
// Indicator Types
// ============================================================================

export type IndicatorType = "raw" | "common";

export type InstanceIndicatorDetails = {
  commonIndicators: CommonIndicatorWithMappings[];
  rawIndicators: RawIndicatorWithMappings[];
};

export type CommonIndicatorWithMappings = {
  indicator_common_id: string;
  indicator_common_label: string;
  is_default: boolean;
  raw_indicator_ids: string[]; // Array of mapped raw IDs
};

export type RawIndicatorWithMappings = {
  raw_indicator_id: string;
  raw_indicator_label: string;
  indicator_common_ids: string[];
};

export type BatchIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  mapped_raw_indicator_ids: string; // This will be comma-separated or semicolon-separated raw_indicator_ids
};

// ============================================================================
// Scorecard Indicators
// ============================================================================

export type ScorecardIndicator = {
  scorecard_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;

  num_indicator_id: string;
  denom:
    | { kind: "indicator"; indicator_id: string }
    | { kind: "population"; population_fraction: number };

  format_as: "percent" | "number" | "rate_per_10k";
  decimal_places: number;

  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface DHIS2DataElement {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  shortName?: string;
  aggregationType?: string;
  domainType?: string;
  valueType?: string;
  categoryCombo?: {
    id: string;
    name: string;
  };
  dataElementGroups?: Array<{
    id: string;
    name: string;
  }>;
  created?: string;
  lastUpdated?: string;
}

export interface DHIS2Indicator {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  shortName?: string;
  numerator?: string;
  denominator?: string;
  annualized?: boolean;
  indicatorType?: {
    id: string;
    name: string;
    factor: number;
  };
  indicatorGroups?: Array<{
    id: string;
    name: string;
  }>;
  created?: string;
  lastUpdated?: string;
}

export interface DHIS2DataElementGroup {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  dataElements?: Array<{
    id: string;
    name: string;
  }>;
}

export interface DHIS2IndicatorGroup {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  indicators?: Array<{
    id: string;
    name: string;
  }>;
}

export interface DHIS2CategoryCombo {
  id: string;
  name: string;
  displayName: string;
  code?: string;
  categories?: Array<{
    id: string;
    name: string;
  }>;
  categoryOptionCombos?: Array<{
    id: string;
    name: string;
  }>;
}

export interface DHIS2PagedResponse<T> {
  pager?: {
    page: number;
    pageCount: number;
    total: number;
    pageSize: number;
  };
}
