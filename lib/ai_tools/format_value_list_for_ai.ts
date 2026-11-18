import { foldString, matchesSearch, searchTokens } from "@timroberton/panther";
import { formatReplicantLabelForDisplay } from "../format_nigeria_admin_label.ts";
import { AI_INLINE_LIST_MAX, dimensionLookupSentence } from "./read_bounds.ts";

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

// The value list in the validator's and the replicant check's errors. `near`
// is the text the copilot sent, and `lookup` the metric and the dimension the
// values are of.
export function formatValueListForAI(
  values: { id: string; label: string }[],
  near: string[],
  lookup: { metricId: string; disOpt: string },
): string {
  if (values.length <= AI_INLINE_LIST_MAX) {
    return values.map(formatValueForAI).join(", ");
  }
  const tooMany = `${values.length} values, too many to list`;
  const pointer = dimensionLookupSentence(lookup.metricId, lookup.disOpt);
  const search = searchForAI(near);
  if (search === undefined) {
    return `${tooMany}. ${pointer}`;
  }
  const matched = values.filter((v) => search.matches(`${v.id} ${v.label}`));
  const counts = `${tooMany}; ${matched.length} match ${search.quoted}`;
  if (matched.length === 0) {
    return `${counts}. ${pointer}`;
  }
  const listed = matched.slice(0, AI_INLINE_LIST_MAX).map(formatValueForAI);
  return matched.length > AI_INLINE_LIST_MAX
    ? `${counts}, the first ${AI_INLINE_LIST_MAX} listed: ${
      listed.join(", ")
    }. ${pointer}`
    : `${counts}: ${listed.join(", ")}. ${pointer}`;
}

// A replicant's values with each label as the figure displays it.
export function replicantValuesForAI(
  values: { id: string; label: string }[],
  replicateBy: string,
): { id: string; label: string }[] {
  return values.map((v) => ({
    id: v.id,
    label: formatReplicantLabelForDisplay(v.label, replicateBy, undefined),
  }));
}

// Checks compare ids, so a value whose label differs is written
// `id (label)`: a caller that copies the label alone fails again.
export function formatValueForAI(v: { id: string; label: string }): string {
  return v.label && v.label !== v.id ? `${v.id} (${v.label})` : v.id;
}
