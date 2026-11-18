import { AIToolFailure } from "@timroberton/panther";

// The most entries a list whose length follows the data writes where the
// copilot did not ask for that list. Over it the list is written as its
// count.
export const AI_INLINE_LIST_MAX = 100;

// The most values one call of get_dimension_values writes for a named
// dimension.
export const AI_VALUE_PAGE_MAX = 500;

// The sentence a text ends with when it holds a dimension's values only as a
// count, or only those near what the copilot sent.
export function dimensionLookupSentence(
  metricId: string,
  disOpt: string,
): string {
  return `get_dimension_values with metricId "${metricId}" and disOpt "${disOpt}" lists this dimension's values under the scope, before any filter, and its search finds one by name or id.`;
}

export type PageForAI<T> = { entries: T[]; summary: string };

// One page of a list the copilot reads in pages, and the sentence that says
// which entries it holds, how many there are and where the next page starts.
// An offset of 0 is never refused, so a list with nothing in it reads as
// empty rather than as a bad offset.
export function pageForAI<T>(
  all: T[],
  offset: number,
  pageSize: number,
  noun: string,
): PageForAI<T> {
  if (offset > 0 && offset >= all.length) {
    throw new AIToolFailure(
      all.length === 0
        ? `offset ${offset} is past the end: there are no ${noun}.`
        : `offset ${offset} is past the end: there are ${all.length} ${noun}, so an offset must be below ${all.length}.`,
    );
  }
  if (all.length === 0) {
    return { entries: [], summary: `No ${noun} to write.` };
  }
  const entries = all.slice(offset, offset + pageSize);
  const end = offset + entries.length;
  const written = `Written: ${noun} ${offset + 1} to ${end} of ${all.length}.`;
  return {
    entries,
    summary: end < all.length
      ? `${written} The next page is offset ${end}.`
      : written,
  };
}
