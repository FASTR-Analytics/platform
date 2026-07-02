import { capitalizeFirstLetter } from "@timroberton/panther";

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

export const INDICATOR_ID_MAX_LENGTH = 128;

export type NewIndicatorIdIssue =
  | "empty"
  | "untrimmed"
  | "forbidden_chars"
  | "too_long";

// Applies to NEWLY created ids only (never to existing stored ids). Commas,
// semicolons, and colons corrupt the STRING_AGG/split round-trip and the CSV
// import re-split. Dots stay legal (DHIS2 operand ids contain them).
export function getNewIndicatorIdIssue(
  id: string,
): NewIndicatorIdIssue | undefined {
  if (id.length === 0) {
    return "empty";
  }
  if (id.trim() !== id) {
    return "untrimmed";
  }
  if (/[,;:]/.test(id)) {
    return "forbidden_chars";
  }
  if (id.length > INDICATOR_ID_MAX_LENGTH) {
    return "too_long";
  }
  return undefined;
}

export function describeNewIndicatorIdIssue(issue: NewIndicatorIdIssue): string {
  switch (issue) {
    case "empty":
      return "must not be empty";
    case "untrimmed":
      return "must not have leading or trailing whitespace";
    case "forbidden_chars":
      return "must not contain commas, semicolons, or colons";
    case "too_long":
      return `must be at most ${INDICATOR_ID_MAX_LENGTH} characters`;
  }
}

// ============================================================================
// Calculated indicators
// ============================================================================

export const POPULATION_TYPES = [
  { id: "total_population", label: "Total population" },
  { id: "u5", label: "Under 5 population" },
  { id: "u1", label: "Under 1 population" },
  { id: "wra", label: "Women of reproductive age (15-49)" },
  { id: "births", label: "Expected births" },
  { id: "pregnancies", label: "Expected pregnancies" },
] as const;

export type PopulationType = (typeof POPULATION_TYPES)[number]["id"];

export type CalculatedIndicator = {
  calculated_indicator_id: string;
  label: string;
  group_label: string;
  sort_order: number;

  num_indicator_id: string;
  denom:
    | { kind: "none" }
    | { kind: "indicator"; indicator_id: string }
    | { kind: "population"; population_type: PopulationType; multiplier: number };

  format_as: "percent" | "number" | "rate_per_10k";

  threshold_direction: "higher_is_better" | "lower_is_better";
  threshold_green: number;
  threshold_yellow: number;
};

// ============================================================================
// Type Definitions
// ============================================================================

export interface DHIS2CategoryOptionCombo {
  id: string;
  name: string;
  displayName?: string;
}

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
    isDefault?: boolean;
    categoryOptionCombos?: DHIS2CategoryOptionCombo[];
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

// ============================================================================
// Indicator Metadata (for presentation objects)
// ============================================================================

export type IndicatorMetadata = {
  id: string;
  label: string;
  format_as?: "percent" | "number" | "rate_per_10k";
  threshold_direction?: "higher_is_better" | "lower_is_better";
  threshold_green?: number;
  threshold_yellow?: number;
  group_label?: string;
  sort_order?: number;
};

export function indicatorMetadataToLabelMap(
  metadata: IndicatorMetadata[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of metadata) {
    map[m.id] = capitalizeFirstLetter(m.label);
  }
  return map;
}
