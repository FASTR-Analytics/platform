import { AIToolFailure } from "@timroberton/panther";

// The most values get_dimension_values writes for one dimension when it lists
// every dimension; over it the dimension is written as its count.
export const AI_INLINE_LIST_MAX = 100;

// The most values one call of get_dimension_values writes for a named
// dimension.
export const AI_VALUE_PAGE_MAX = 500;

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
