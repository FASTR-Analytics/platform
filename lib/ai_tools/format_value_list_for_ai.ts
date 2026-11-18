import { foldString, matchesSearch, searchTokens } from "@timroberton/panther";
import { formatReplicantLabelForDisplay } from "../format_nigeria_admin_label.ts";

// Bounds the text one value list adds to the copilot's context.
export const AI_VALUE_LIST_MAX = 500;

// Every dimension value list the copilot reads. Checks compare ids, so a value
// whose label differs is written `id (label)`: a caller that copies the label
// alone fails again. A list longer than AI_VALUE_LIST_MAX is written as its
// counts and the values that match one of the `near` strings, the text the
// copilot sent, by the matcher every searchable list in the app uses.
export function formatValueListForAI(
  values: { id: string; label: string }[],
  near: string[],
): string {
  if (values.length <= AI_VALUE_LIST_MAX) {
    return values.map(formatValue).join(", ");
  }
  const tooMany = `${values.length} values, too many to list`;
  const queries = near
    .map((text) => ({ text, tokens: searchTokens(text) }))
    .filter((q) => q.tokens.length > 0);
  if (queries.length === 0) {
    return `${tooMany}.`;
  }
  const matched = values.filter((v) => {
    const folded = foldString(`${v.id} ${v.label}`);
    return queries.some((q) => matchesSearch(folded, q.tokens));
  });
  const terms = queries.map((q) => `"${q.text}"`).join(" or ");
  const counts = `${tooMany}; ${matched.length} match ${terms}`;
  if (matched.length === 0) {
    return `${counts}.`;
  }
  const listed = matched.slice(0, AI_VALUE_LIST_MAX).map(formatValue);
  return matched.length > AI_VALUE_LIST_MAX
    ? `${counts}, the first ${AI_VALUE_LIST_MAX} listed: ${listed.join(", ")}`
    : `${counts}: ${listed.join(", ")}`;
}

export function formatReplicantValueListForAI(
  values: { id: string; label: string }[],
  replicateBy: string,
  selected: string | undefined,
): string {
  return formatValueListForAI(
    values.map((v) => ({
      id: v.id,
      label: formatReplicantLabelForDisplay(v.label, replicateBy, undefined),
    })),
    selected ? [selected] : [],
  );
}

function formatValue(v: { id: string; label: string }): string {
  return v.label && v.label !== v.id ? `${v.id} (${v.label})` : v.id;
}
