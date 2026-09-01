import { capitalizeFirstLetter } from "@timroberton/panther";
import type { TranslatableString } from "../translate/types.ts";

// ============================================================================
// Indicator Types
// ============================================================================

export type IndicatorType = "raw" | "common";

export type InstanceIndicatorDetails = {
  commonIndicators: CommonIndicatorWithMappings[];
  rawIndicators: RawIndicatorWithMappings[];
};

export type CommonIndicatorWithMappings = CommonIndicator & {
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
// import re-split. Square brackets break the expression grammar's [quoted
// identifier] form, which has no escape (PLAN_1a §1.3) — one rule for common
// AND raw ids, since raw ids have no use for brackets either. Instance
// migration 079 guards stored ids the same way. Dots stay legal (DHIS2
// operand ids contain them).
export function getNewIndicatorIdIssue(
  id: string,
): NewIndicatorIdIssue | undefined {
  if (id.length === 0) {
    return "empty";
  }
  if (id.trim() !== id) {
    return "untrimmed";
  }
  if (/[,;:[\]]/.test(id)) {
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
      return "must not contain commas, semicolons, colons, or square brackets";
    case "too_long":
      return `must be at most ${INDICATOR_ID_MAX_LENGTH} characters`;
  }
}

// ============================================================================
// Common indicator definitions
// ============================================================================

export const POPULATION_TYPES = [
  {
    id: "total_population",
    label: { en: "Total population", fr: "Population totale" },
  },
  {
    id: "u5",
    label: { en: "Under 5 population", fr: "Population des moins de 5 ans" },
  },
  {
    id: "u1",
    label: { en: "Under 1 population", fr: "Population des moins de 1 an" },
  },
  {
    id: "wra",
    label: {
      en: "Women of reproductive age (15-49)",
      fr: "Femmes en âge de procréer (15-49)",
    },
  },
  { id: "births", label: { en: "Expected births", fr: "Naissances attendues" } },
  {
    id: "pregnancies",
    label: { en: "Expected pregnancies", fr: "Grossesses attendues" },
  },
] as const satisfies readonly { id: string; label: TranslatableString }[];

export type PopulationType = (typeof POPULATION_TYPES)[number]["id"];

export function isValidPopulationType(value: string): value is PopulationType {
  return POPULATION_TYPES.some((pt) => pt.id === value);
}

export function assertValidPopulationType(
  value: string,
  fieldName: string,
): asserts value is PopulationType {
  if (!isValidPopulationType(value)) {
    const validTypes = POPULATION_TYPES.map((pt) => pt.id).join(", ");
    throw new Error(
      `Invalid ${fieldName}: ${JSON.stringify(value)}. ` +
        `Must be one of: ${validTypes}.`,
    );
  }
}

// What a common indicator IS (PLAN_1a §1.2). Generation decides what the
// numbers are made of; the query only aggregates and applies the formula.
//
//   base            — mapped raw indicators, summed at extract. No formula.
//   derived         — an arbitrary expression over other commons (base or
//                     derived; chained by substitution). Its additive
//                     ingredients travel on the results row and the
//                     expression is applied AFTER aggregation.
//   population_rate — a numerator expression over commons ONLY (it never
//                     names the population term), divided by person-years of
//                     the named population and scaled. Generation assigns
//                     person-years its own ingredient slot and composes the
//                     final catalog expression, so nothing downstream carries
//                     a population carve-out.
export type CommonIndicatorDefinition =
  | { type: "base" }
  | { type: "derived"; expression: string }
  | {
    type: "population_rate";
    numeratorExpression: string;
    populationType: PopulationType;
    multiplier: number;
  };

export type CommonIndicatorType = CommonIndicatorDefinition["type"];

export const COMMON_INDICATOR_TYPES: readonly CommonIndicatorType[] = [
  "base",
  "derived",
  "population_rate",
] as const;

export function isCommonIndicatorType(
  value: string,
): value is CommonIndicatorType {
  return (COMMON_INDICATOR_TYPES as readonly string[]).includes(value);
}

// Traffic-light thresholds. Absent means the indicator is never coloured.
export type CommonIndicatorThresholds = {
  direction: "higher_is_better" | "lower_is_better";
  green: number;
  yellow: number;
};

export type CommonIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  is_default: boolean;
  definition: CommonIndicatorDefinition;
  format_as: IndicatorFormat;
  thresholds: CommonIndicatorThresholds | null;
  group_label: string;
  sort_order: number;
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

export interface DHIS2PagedResponse {
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

// How an indicator's values are written. Wider than a metric's own `formatAs`,
// whose value branch is percent/number (the third value, "indicator", DEFERS to
// this type rather than naming a format) — a rate is only ever an
// indicator-level fact.
export type IndicatorFormat = "percent" | "number" | "rate_per_10k";

export type IndicatorMetadata = {
  id: string;
  label: string;
  format_as?: IndicatorFormat;
  threshold_direction?: "higher_is_better" | "lower_is_better";
  threshold_green?: number;
  threshold_yellow?: number;
  group_label?: string;
  sort_order?: number;
  // Common-indicator evaluation, stamped for HMIS dictionaries only
  // (PLAN_1a §1.5). `expression` is the FLATTENED formula — every identifier
  // in it is a base common indicator, and `slot_map` says which ingredient
  // column of an indicator_values row carries that base indicator's sum. A
  // `base` indicator's expression is its own single slot. Absent on every
  // other family's catalog entries, and on a `population_rate` whose person-
  // years term the package does not carry.
  type?: CommonIndicatorType;
  expression?: string;
  slot_map?: Record<string, string>;
};

// What a figure needs in order to DISPLAY an indicator. The evaluation fields
// are generation facts the server computes values with; they never travel to a
// client and are never frozen into a stored figure snapshot, so the wire type
// omits them and the compiler enforces the projection.
export type IndicatorMetadataDisplay = Omit<
  IndicatorMetadata,
  "type" | "expression" | "slot_map"
>;

export function toIndicatorMetadataDisplay(
  metadata: IndicatorMetadata[],
): IndicatorMetadataDisplay[] {
  return metadata.map(({ type: _t, expression: _e, slot_map: _s, ...rest }) =>
    rest
  );
}

export function indicatorMetadataToLabelMap(
  metadata: IndicatorMetadataDisplay[],
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const m of metadata) {
    map[m.id] = capitalizeFirstLetter(m.label);
  }
  return map;
}
