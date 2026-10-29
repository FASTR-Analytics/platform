import { getTruncatedString } from "@timroberton/panther";
import { getReplicateByProp } from "./get_disaggregator_display_prop.ts";
import { formatReplicantLabelForDisplay } from "./format_nigeria_admin_label.ts";
import type { AdminAreaLevel, PresentationObjectConfig } from "./types/mod.ts";

export function withReplicant(
  str: string,
  config: PresentationObjectConfig,
  indicatorLabelReplacements: Record<string, string>,
  countryIso3?: string,
): string {
  const replicateBy = getReplicateByProp(config);
  if (config && !replicateBy) {
    return str;
  }
  if (config.d.selectedReplicantValue === undefined) {
    return str
      .replaceAll("REPLICANT", "Unselected")
      .replaceAll("RÉPLICANT", "Unselected");
  }
  const replicantLabel = formatReplicantLabelForDisplay(
    indicatorLabelReplacements[config.d.selectedReplicantValue] ??
      config.d.selectedReplicantValue,
    replicateBy,
    countryIso3,
  );
  return str
    .replaceAll("REPLICANT", replicantLabel)
    .replaceAll("RÉPLICANT", replicantLabel);
}

export function encodeRawCsvHeader(
  i_colHeader: number,
  colHeader: string,
): string {
  return `Col ${i_colHeader + 1}: ${colHeader}`;
}

export function decodeRawCsvHeader(encodedColHeader: string): string {
  return encodedColHeader.replace(/^Col \d+: /, "");
}

export const HFA_CORE_WEIGHT_COLUMN = "wgt";
export const HFA_CORE_STRATUM_COLUMN = "stratum";

// The facility id column defaults to the first of these that holds a value:
// the generic form has no id_fac_txt, and some rounds leave it blank.
export const HFA_CORE_FACILITY_ID_COLUMNS = ["id_fac_txt", "id_fac"];

// Questionnaire variables that identify the facility or the interview rather
// than answer a question, so no indicator is expected to use them.
export const HFA_STRUCTURAL_VARIABLE_IDS: ReadonlySet<string> = new Set([
  "id_admin1",
  "id_admin1_corrected",
  "id_fac_type",
  "id_resp_consent",
  "result",
]);

// The questionnaire's names for the facility columns, matched ignoring case.
// Level 1 is the country and never a column, so level 2 is the form's admin 1.
// Ownership has no core name.
export const HFA_CORE_ADMIN_AREA_COLUMNS: Record<AdminAreaLevel, string> = {
  2: "id_admin1_name",
  3: "id_admin2_name",
  4: "id_admin3_name",
};
// The questionnaire's name for a column's correction: id_admin1_name has
// id_admin1_corrected, id_fac_type has id_fac_type_corrected.
export function hfaCorrectionColumnName(rawColHeader: string): string {
  return `${rawColHeader.replace(/_(name|txt)$/i, "")}_corrected`;
}

export function findEncodedCsvHeader(
  rawColHeaders: string[],
  colHeader: string,
): string {
  const i_colHeader = rawColHeaders.indexOf(colHeader);
  return i_colHeader === -1 ? "" : encodeRawCsvHeader(i_colHeader, colHeader);
}

export function findEncodedCsvHeaderIgnoringCase(
  rawColHeaders: string[],
  colHeader: string,
): string {
  const lower = colHeader.toLowerCase();
  const i_colHeader = rawColHeaders.findIndex((h) => h.toLowerCase() === lower);
  return i_colHeader === -1
    ? ""
    : encodeRawCsvHeader(i_colHeader, rawColHeaders[i_colHeader]);
}

// The first candidate that is a header of the file holding a non-blank value
// in some row, as its encoded header, or "" when none does.
export function findFirstEncodedCsvHeaderWithValues(
  rawColHeaders: string[],
  candidates: string[],
  encodedHeadersWithValues: string[],
): string {
  const withValues = new Set(encodedHeadersWithValues);
  for (const candidate of candidates) {
    for (let i = 0; i < rawColHeaders.length; i++) {
      const encoded = encodeRawCsvHeader(i, rawColHeaders[i]);
      if (rawColHeaders[i] === candidate && withValues.has(encoded)) {
        return encoded;
      }
    }
  }
  return "";
}

export function parseJsonOrUndefined<T>(
  str: string | null | undefined,
): T | undefined {
  if (!str) {
    return undefined;
  }
  try {
    return JSON.parse(str) as T;
  } catch {
    return undefined;
  }
}

export function parseJsonOrThrow<T>(str: string): T {
  try {
    return JSON.parse(str) as T;
  } catch {
    throw new Error("Could not parse JSON: " + getTruncatedString(str, 200));
  }
}
