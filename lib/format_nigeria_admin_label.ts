import { ADMIN_LEVELS } from "./admin_area_rollup.ts";
import { t3 } from "./translate/mod.ts";
import { CountryCodes } from "./types/instance.ts";
import { BLANK_SENTINEL, BLANK_SENTINEL_LABEL } from "./validate_fetch_config.ts";

const ADMIN_AREA_DISAGGREGATIONS = new Set<string>(ADMIN_LEVELS);

export function formatNigeriaAdminAreaLabel(label: string): string {
  // Split by space and trim each word
  let words = label
    .split(" ")
    .map((word) => word.trim())
    .filter((word) => word.length > 0);

  // If first word is exactly 2 characters (e.g., "ab"), remove it
  if (words.length > 0 && words[0].length === 2) {
    words = words.slice(1);
  }

  // Remove "State" and "Local Government Area" (case-insensitive)
  words = words.filter((word) => word.toLowerCase() !== "state");

  return words
    .join(" ")
    .replace(/local government area/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Display-only cleaner for replicant labels. Only strips Nigeria admin-area
// names; everything else (indicators, other countries) passes through
// unchanged. The raw value/id is never touched — only the displayed label.
//
// THE choke point every replicant display surface routes through (picker,
// figure captions via withReplicant, dashboard groups, slide/dashboard modals),
// which is why BLANK_SENTINEL is resolved here rather than at each call site.
// The possible-values query sets label === id for the sentinel, and callers
// holding only a raw replicant value pass that value as the label, so matching
// on the incoming string covers both shapes without a signature change.
export function formatReplicantLabelForDisplay(
  label: string,
  replicateBy: string | undefined,
  countryIso3: string | undefined,
): string {
  if (label === BLANK_SENTINEL) {
    return t3(BLANK_SENTINEL_LABEL);
  }
  if (
    countryIso3 === CountryCodes.Nigeria &&
    replicateBy &&
    ADMIN_AREA_DISAGGREGATIONS.has(replicateBy)
  ) {
    return formatNigeriaAdminAreaLabel(label);
  }
  return label;
}
