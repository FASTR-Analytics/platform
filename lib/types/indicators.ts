import { capitalizeFirstLetter } from "@timroberton/panther";
import type { TranslatableString } from "../translate/types.ts";
import type { ThresholdsRule } from "./conditional_formatting.ts";
import { EXPRESSION_FUNCTION_NAMES } from "../indicator_expression/parse.ts";
import { POPULATION_TYPE_IDS } from "./population.ts";
import {
  isSpecialIndicatorId,
  SPECIAL_INDICATOR_IDS,
} from "../special_indicators.ts";

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
  | "too_long"
  | "reserved"
  | "special_not_base";

// The identifiers no indicator id may be, however the id is produced (typed,
// generated, batch-uploaded, decomposed from DHIS2): the special ids (except
// as a base), the population type ids and the expression function names.
// Instance migration 084 guards stored ids against the last two.
export const RESERVED_WORDS: readonly string[] = [
  ...SPECIAL_INDICATOR_IDS,
  ...POPULATION_TYPE_IDS,
  ...EXPRESSION_FUNCTION_NAMES,
];

// Applies to NEWLY created ids only (never to existing stored ids). Commas,
// semicolons, and colons corrupt the STRING_AGG/split round-trip and the CSV
// import re-split. Square brackets break the expression grammar's [quoted
// identifier] form, which has no escape (PLAN_1a §1.3): one rule for common
// AND raw ids, since raw ids have no use for brackets either. Instance
// migration 079 guards stored ids the same way. Dots stay legal (DHIS2
// operand ids contain them).
function getIdCharsetIssue(id: string): NewIndicatorIdIssue | undefined {
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

// A raw id is a separate namespace that never enters an expression (the
// extract joins raw to common), so the reserved words do not apply to it.
export function getNewSourceIdIssue(
  id: string,
): NewIndicatorIdIssue | undefined {
  return getIdCharsetIssue(id);
}

// A special id is read by the module scripts as a count, so it may exist
// only as a base. Checked at create (inside getNewIndicatorIdIssue) and at
// retype, where the id is not new but its type is.
export function getSpecialIndicatorTypeIssue(
  id: string,
  type: CommonIndicatorType,
): "special_not_base" | undefined {
  return isSpecialIndicatorId(id) && type !== "base"
    ? "special_not_base"
    : undefined;
}

export function getNewIndicatorIdIssue(
  id: string,
  type: CommonIndicatorType,
): NewIndicatorIdIssue | undefined {
  const charsetIssue = getIdCharsetIssue(id);
  if (charsetIssue) {
    return charsetIssue;
  }
  if (isSpecialIndicatorId(id)) {
    return getSpecialIndicatorTypeIssue(id, type);
  }
  if (RESERVED_WORDS.includes(id)) {
    return "reserved";
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
    case "reserved":
      return `is a reserved word (${RESERVED_WORDS.join(", ")})`;
    case "special_not_base":
      return `is a special indicator id, which the analysis modules read as a count, so it can only be a base indicator (special: ${
        SPECIAL_INDICATOR_IDS.join(", ")
      })`;
  }
}

// ============================================================================
// Common indicator definitions
// ============================================================================

// What a common indicator IS (PLAN_1a §1.2, PLAN_1c). Generation decides what
// the numbers are made of; the query only aggregates and applies the formula.
//
//   base   : mapped raw indicators, summed at extract. No formula. A count,
//             so its format is always `number`.
//   derived: an arbitrary expression over other commons (base or derived;
//             chained by substitution) and population terms. Its additive
//             ingredients travel on the results row and the expression is
//             applied AFTER aggregation. A population term is written as
//             the type's id (`population_total`, one of POPULATION_TYPES in
//             lib/types/population.ts, a reserved word); it is a leaf
//             ingredient exactly like a base common, carrying that
//             population's person-years.
export type CommonIndicatorDefinition =
  | { type: "base" }
  | { type: "derived"; expression: string };

export type CommonIndicatorType = CommonIndicatorDefinition["type"];

export const COMMON_INDICATOR_TYPES: readonly CommonIndicatorType[] = [
  "base",
  "derived",
] as const;

export function isCommonIndicatorType(
  value: string,
): value is CommonIndicatorType {
  return (COMMON_INDICATOR_TYPES as readonly string[]).includes(value);
}

// A common indicator's presentation: its display format and, optionally, a
// conditional-formatting rule (cutoffs in STORED units, buckets with colour and
// label, direction). A figure whose CF source is `indicator` colours each value
// by its own indicator's rule; null means the indicator is never coloured.
export type CommonIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  is_default: boolean;
  definition: CommonIndicatorDefinition;
  format_as: IndicatorFormat;
  thresholds: ThresholdsRule | null;
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
  // The period type of each data set the element is collected in. An element
  // in no data set has no period, so the source check refuses it.
  dataSetElements?: Array<{
    dataSet?: {
      id?: string;
      periodType?: string;
    };
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

// ============================================================================
// Source eligibility and indicator decomposition (PLAN_A3 rulings 6 and 8)
// ============================================================================

// Why a DHIS2 data element cannot be a source: it must be an additive monthly
// count by DHIS2's own metadata. `value` is what the metadata said; undefined
// when the field was absent (a period type is absent when the element is in
// no data set). `element_not_found` is for an operand whose element the
// server no longer has.
export type Dhis2SourceRefusal =
  | { kind: "aggregation_type"; value: string | undefined }
  | { kind: "value_type"; value: string | undefined }
  | { kind: "period_type"; value: string | undefined }
  | { kind: "element_not_found" };

export type Dhis2SourceVerdict =
  | { accepted: true }
  | { accepted: false; refusal: Dhis2SourceRefusal };

export type Dhis2DataElementSearchItem = DHIS2DataElement & {
  verdict: Dhis2SourceVerdict;
};

// One `#{uid}` or `#{uid.coc}` term of a DHIS2 indicator formula. `source_id`
// is the term's id as a source (`uid` or `uid.coc`), which is also the
// identifier the decomposed expression names it by.
export type Dhis2ParsedOperand = {
  source_id: string;
  data_element_id: string;
  category_option_combo_id?: string;
};

// Why an indicator formula is outside the whitelist. `term` is the offending
// text where there is one (a syntax refusal carries the token it stopped at).
export type Dhis2IndicatorParseRefusal =
  | { kind: "annualized" }
  | { kind: "factor"; value: number | undefined }
  | { kind: "empty"; side: "numerator" | "denominator" }
  | { kind: "term"; side: "numerator" | "denominator"; term: string }
  | { kind: "syntax"; side: "numerator" | "denominator"; term: string }
  | { kind: "too_many_operands"; count: number; max: number };

// A parsed DHIS2 indicator: its operands, the derived's expression in the
// app's own grammar with each operand written as `[source_id]` (the naming
// step renames those identifiers to the base ids it creates), and the
// display format its factor maps to. `note` is set when the factor is 1000,
// which has no format of its own: the expression carries `* 1000` and the
// derived is formatted as a number.
export type Dhis2IndicatorParse =
  | {
    accepted: true;
    operands: Dhis2ParsedOperand[];
    expression: string;
    format_as: IndicatorFormat;
    note?: TranslatableString;
  }
  | { accepted: false; refusal: Dhis2IndicatorParseRefusal };

export type Dhis2DecompositionOperand = Dhis2ParsedOperand & {
  verdict: Dhis2SourceVerdict;
};

// The parse plus each operand's source verdict, checked through its element
// on the live server. `accepted` is the whole-indicator answer: the parse
// accepted and every operand accepted.
export type Dhis2IndicatorDecomposition = {
  accepted: boolean;
  parse: Dhis2IndicatorParse;
  operands: Dhis2DecompositionOperand[];
};

export type Dhis2IndicatorSearchItem = DHIS2Indicator & {
  decomposition: Dhis2IndicatorDecomposition;
};

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
// this type rather than naming a format): a rate is only ever an
// indicator-level fact.
export type IndicatorFormat = "percent" | "number" | "rate_per_10k";

export type IndicatorMetadata = {
  id: string;
  label: string;
  format_as?: IndicatorFormat;
  // The indicator's own CF rule (common indicators only). The `indicator` CF
  // source resolves it per value through EffectiveIndicatorFacts.ruleForValue.
  thresholds?: ThresholdsRule;
  // The HFA/ICEH category carrier; a common indicator never sets it.
  group_label?: string;
  sort_order?: number;
  // Common-indicator evaluation, stamped for HMIS dictionaries only
  // (PLAN_1a §1.5). `expression` is the FLATTENED formula: every identifier
  // in it is a base common indicator or a population type id, and
  // `slot_map` says which ingredient column of an indicator_values row
  // carries that ingredient's sum. A `base` indicator's expression is its own
  // single slot. Absent on every other family's catalog entries, and on a
  // base common the extract has no counts for.
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
