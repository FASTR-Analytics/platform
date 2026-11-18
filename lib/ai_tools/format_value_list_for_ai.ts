import { foldString, matchesSearch, searchTokens } from "@timroberton/panther";
import { formatReplicantLabelForDisplay } from "../format_nigeria_admin_label.ts";

// Bounds the text one value list adds to the copilot's context.
export const AI_VALUE_LIST_MAX = 500;

// The terms the copilot sent, matched by the matcher every searchable list in
// the app uses: a text matches when it holds every token of one term. A term
// with no token is dropped, and with none left there is no search.
export type SearchForAI = {
  // The terms as the sentence that states a match count names them.
  quoted: string;
  matches: (text: string) => boolean;
};

export function searchForAI(terms: string[]): SearchForAI | undefined {
  const queries = terms
    .map((text) => ({ text, tokens: searchTokens(text) }))
    .filter((q) => q.tokens.length > 0);
  if (queries.length === 0) {
    return undefined;
  }
  return {
    quoted: queries.map((q) => `"${q.text}"`).join(" or "),
    matches: (text) => {
      const folded = foldString(text);
      return queries.some((q) => matchesSearch(folded, q.tokens));
    },
  };
}

// Every dimension value list the copilot reads. `near` is the text the
// copilot sent.
export function formatValueListForAI(
  values: { id: string; label: string }[],
  near: string[],
): string {
  if (values.length <= AI_VALUE_LIST_MAX) {
    return values.map(formatValueForAI).join(", ");
  }
  const tooMany = `${values.length} values, too many to list`;
  const search = searchForAI(near);
  if (search === undefined) {
    return `${tooMany}.`;
  }
  const matched = values.filter((v) => search.matches(`${v.id} ${v.label}`));
  const counts = `${tooMany}; ${matched.length} match ${search.quoted}`;
  if (matched.length === 0) {
    return `${counts}.`;
  }
  const listed = matched.slice(0, AI_VALUE_LIST_MAX).map(formatValueForAI);
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

// Checks compare ids, so a value whose label differs is written
// `id (label)`: a caller that copies the label alone fails again.
export function formatValueForAI(v: { id: string; label: string }): string {
  return v.label && v.label !== v.id ? `${v.id} (${v.label})` : v.id;
}
