import { ADMIN_LEVELS } from "./admin_area_rollup.ts";
import { CountryCodes } from "./types/instance.ts";

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
export function formatReplicantLabelForDisplay(
  label: string,
  replicateBy: string | undefined,
  countryIso3: string | undefined,
): string {
  if (
    countryIso3 === CountryCodes.Nigeria &&
    replicateBy &&
    ADMIN_AREA_DISAGGREGATIONS.has(replicateBy)
  ) {
    return formatNigeriaAdminAreaLabel(label);
  }
  return label;
}
