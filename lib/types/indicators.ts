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

export type InstanceIndicatorDetails = {
  indicators: HmisIndicator[];
};

// The one dictionary file (PLAN_A4 ruling 7): `dhis2_id` for a DHIS2
// element, `members` semicolon-separated for a sum, `expression` for a
// derived, `include_in_analysis` true/false, `thresholds` the rule as JSON
// text or empty. The download mirrors the upload.
export const INDICATOR_BATCH_FILE_COLUMNS = [
  "indicator_id",
  "label",
  "type",
  "dhis2_id",
  "members",
  "expression",
  "include_in_analysis",
  "format_as",
  "thresholds",
] as const;

export const INDICATOR_BATCH_MEMBERS_SEPARATOR = ";";

// What a base's dhis2_id may be: a data element UID or an operand `UID.UID`.
export const DHIS2_UID_PATTERN = /^[a-zA-Z][a-zA-Z0-9]{10}$/;
export const DHIS2_OPERAND_PATTERN =
  /^([a-zA-Z][a-zA-Z0-9]{10})\.([a-zA-Z][a-zA-Z0-9]{10})$/;

export function isDhis2ShapedId(id: string): boolean {
  return DHIS2_UID_PATTERN.test(id) || DHIS2_OPERAND_PATTERN.test(id);
}

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
// semicolons, and colons corrupt the batch file's member list and the CSV
// round-trip. Square brackets break the expression grammar's [quoted
// identifier] form, which has no escape (PLAN_1a §1.3). Instance migration
// 079 guards stored ids the same way. Dots stay legal.
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

// A special id is read by the module scripts as a count, so it may exist
// only as a base or a sum. Checked at create (inside getNewIndicatorIdIssue)
// and at retype, where the id is not new but its type is.
export function getSpecialIndicatorTypeIssue(
  id: string,
  type: HmisIndicatorType,
): "special_not_base" | undefined {
  return isSpecialIndicatorId(id) && type === "derived"
    ? "special_not_base"
    : undefined;
}

export function getNewIndicatorIdIssue(
  id: string,
  type: HmisIndicatorType,
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
      return `is a special indicator id, which the analysis modules read as a count, so it cannot be a derived indicator (special: ${
        SPECIAL_INDICATOR_IDS.join(", ")
      })`;
  }
}

// ============================================================================
// HMIS indicator definitions
// ============================================================================

// What an indicator IS (PLAN_A4 §2). Generation decides what the numbers
// are made of; the query only aggregates and applies the formula.
//
//   base   : an additive monthly series with rows in dataset_hmis. With a
//             `dhis2_id` (a data element UID or `UID.COC` operand) the
//             DHIS2 import fetches it; without one it is filled by CSV
//             upload, where the file's indicator column value is the
//             indicator's own id. A count: its format is always `number`.
//   sum    : a list of base ids, `members`, summed from their rows at
//             extract into one facility x month series, adjusted by m001
//             and m002 like any base. A count; format `number`.
//   derived: an arbitrary expression over indicators of any type (chained
//             by substitution) and population terms, evaluated by m012
//             after adjustment and aggregation. A population term is
//             written as the type's id (`population_total`, one of
//             POPULATION_TYPES in lib/types/population.ts, a reserved
//             word); it is a leaf ingredient exactly like a base, carrying
//             that population's person-years.
export type HmisIndicatorDefinition =
  | { type: "base"; dhis2_id: string | null }
  | { type: "sum"; members: string[] }
  | { type: "derived"; expression: string };

export type HmisIndicatorType = HmisIndicatorDefinition["type"];

export const HMIS_INDICATOR_TYPES: readonly HmisIndicatorType[] = [
  "base",
  "sum",
  "derived",
] as const;

export function isHmisIndicatorType(
  value: string,
): value is HmisIndicatorType {
  return (HMIS_INDICATOR_TYPES as readonly string[]).includes(value);
}

// An HMIS indicator's presentation: its display format and, optionally, a
// conditional-formatting rule (cutoffs in STORED units, buckets with colour and
// label, direction). A figure whose CF source is `indicator` colours each value
// by its own indicator's rule; null means the indicator is never coloured.
// `include_in_analysis` on means the extract carries the indicator and m001
// and m002 adjust it (the analysed set, PLAN_A4 ruling 3, stated once in
// lib/hmis_indicator_catalog.ts); off means dictionary only: its data is
// still imported and stored, and it is still usable as a member or in an
// expression.
export type HmisIndicator = {
  indicator_common_id: string;
  indicator_common_label: string;
  definition: HmisIndicatorDefinition;
  include_in_analysis: boolean;
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
  // in no data set has no period, so the eligibility check refuses it.
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
// Element eligibility and indicator decomposition (PLAN_A3 rulings 6 and 8)
// ============================================================================

// Why a DHIS2 data element cannot fill a base: it must be an additive monthly
// count by DHIS2's own metadata. `value` is what the metadata said; undefined
// when the field was absent (a period type is absent when the element is in
// no data set). `element_not_found` is for an operand whose element the
// server no longer has.
export type Dhis2ElementRefusal =
  | { kind: "aggregation_type"; value: string | undefined }
  | { kind: "value_type"; value: string | undefined }
  | { kind: "period_type"; value: string | undefined }
  | { kind: "element_not_found" };

export type Dhis2ElementVerdict =
  | { accepted: true }
  | { accepted: false; refusal: Dhis2ElementRefusal };

export type Dhis2DataElementSearchItem = DHIS2DataElement & {
  verdict: Dhis2ElementVerdict;
};

// One `#{uid}` or `#{uid.coc}` term of a DHIS2 indicator formula. `dhis2_id`
// is the term's id as a base's dhis2_id (`uid` or `uid.coc`), which is also
// the identifier the decomposed expression names it by.
export type Dhis2ParsedOperand = {
  dhis2_id: string;
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
// app's own grammar with each operand written as `[dhis2_id]` (the naming
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
  verdict: Dhis2ElementVerdict;
};

// The parse plus each operand's eligibility verdict, checked through its element
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

export function describeDhis2ElementRefusal(
  refusal: Dhis2ElementRefusal,
): TranslatableString {
  switch (refusal.kind) {
    case "aggregation_type":
      return {
        en: `its aggregation type is ${refusal.value ?? "not set"}, not SUM`,
        fr: `son type d'agrégation est ${refusal.value ?? "non défini"}, pas SUM`,
        pt: `o seu tipo de agregação é ${refusal.value ?? "não definido"}, não SUM`,
      };
    case "value_type":
      return {
        en: `its value type is ${refusal.value ?? "not set"}, not a count`,
        fr: `son type de valeur est ${refusal.value ?? "non défini"}, pas un dénombrement`,
        pt: `o seu tipo de valor é ${refusal.value ?? "não definido"}, não uma contagem`,
      };
    case "period_type":
      return refusal.value === undefined
        ? {
          en: "it is in no data set, so it has no period type",
          fr: "il n'appartient à aucun ensemble de données et n'a donc pas de type de période",
          pt: "não pertence a nenhum conjunto de dados, pelo que não tem tipo de período",
        }
        : {
          en: `its data sets are ${refusal.value}; none is monthly`,
          fr: `ses ensembles de données sont ${refusal.value} ; aucun n'est mensuel`,
          pt: `os seus conjuntos de dados são ${refusal.value}; nenhum é mensal`,
        };
    case "element_not_found":
      return {
        en: "its data element no longer exists on the DHIS2 server",
        fr: "son élément de données n'existe plus sur le serveur DHIS2",
        pt: "o seu elemento de dados já não existe no servidor DHIS2",
      };
  }
}

export function describeDhis2ParseRefusal(
  refusal: Dhis2IndicatorParseRefusal,
): TranslatableString {
  const side = (s: "numerator" | "denominator") =>
    s === "numerator"
      ? { en: "numerator", fr: "numérateur", pt: "numerador" }
      : { en: "denominator", fr: "dénominateur", pt: "denominador" };
  switch (refusal.kind) {
    case "annualized":
      return {
        en: "it is annualized",
        fr: "il est annualisé",
        pt: "é anualizado",
      };
    case "factor":
      return {
        en: `its factor is ${refusal.value ?? "not set"}; only 1, 100, 1000 and 10000 are supported`,
        fr: `son facteur est ${refusal.value ?? "non défini"} ; seuls 1, 100, 1000 et 10000 sont pris en charge`,
        pt: `o seu fator é ${refusal.value ?? "não definido"}; apenas 1, 100, 1000 e 10000 são suportados`,
      };
    case "empty":
      return {
        en: `its ${side(refusal.side).en} is empty`,
        fr: `son ${side(refusal.side).fr} est vide`,
        pt: `o seu ${side(refusal.side).pt} está vazio`,
      };
    case "term":
      return {
        en: `its ${side(refusal.side).en} contains ${refusal.term}, which is outside the supported formula forms`,
        fr: `son ${side(refusal.side).fr} contient ${refusal.term}, qui n'est pas une forme de formule prise en charge`,
        pt: `o seu ${side(refusal.side).pt} contém ${refusal.term}, que está fora das formas de fórmula suportadas`,
      };
    case "syntax":
      return {
        en: `its ${side(refusal.side).en} could not be read at ${refusal.term}`,
        fr: `son ${side(refusal.side).fr} n'a pas pu être lu à ${refusal.term}`,
        pt: `o seu ${side(refusal.side).pt} não pôde ser lido em ${refusal.term}`,
      };
    case "too_many_operands":
      return {
        en: `it has ${refusal.count} distinct operands; at most ${refusal.max} are supported`,
        fr: `il a ${refusal.count} opérandes distincts ; au plus ${refusal.max} sont pris en charge`,
        pt: `tem ${refusal.count} operandos distintos; no máximo ${refusal.max} são suportados`,
      };
  }
}

// ============================================================================
// The naming step (PLAN_A4 ruling 6)
// ============================================================================

// A DHIS2 element or operand the naming step imports: it becomes a new base
// under `indicator_id` carrying `dhis2_id`, or, when `indicator_id` names an
// existing base that has no dhis2_id, assigns the UID to that base. Any
// other existing id is refused. A dhis2_id that already belongs to an
// indicator creates nothing.
export type IndicatorNamingElement = {
  dhis2_id: string;
  indicator_id: string;
  label: string;
};

// A CSV column id the naming step turns into an uploaded base: the id is
// what the file says, so it is the indicator's own id.
export type IndicatorNamingUploaded = {
  indicator_id: string;
  label: string;
};

// A derived indicator authored over candidate elements: its expression names
// each element by `[dhis2_id]`, and the transaction rewrites every identifier
// to the indicator that element lands in.
export type IndicatorNamingDerived = {
  indicator_id: string;
  label: string;
  expression: string;
  format_as: IndicatorFormat;
};

export type IndicatorNamingInput = {
  elements: IndicatorNamingElement[];
  uploaded: IndicatorNamingUploaded[];
  derived: IndicatorNamingDerived[];
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
  // The indicator's own CF rule (HMIS indicators only). The `indicator` CF
  // source resolves it per value through EffectiveIndicatorFacts.ruleForValue.
  thresholds?: ThresholdsRule;
  // The HFA/ICEH category carrier; an HMIS indicator never sets it.
  group_label?: string;
  sort_order?: number;
  // Common-indicator evaluation, stamped for HMIS dictionaries only
  // (PLAN_1a §1.5). `expression` is the FLATTENED formula: every identifier
  // in it is a base indicator id or a population type id, and
  // `slot_map` says which ingredient column of an indicator_values row
  // carries that ingredient's sum. A `base` indicator's expression is its own
  // single slot. Absent on every other family's catalog entries, and on a
  // base the extract has no counts for.
  type?: HmisIndicatorType;
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
