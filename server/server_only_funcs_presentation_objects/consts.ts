import { BLANK_SENTINEL } from "lib";

export const MAX_ITEMS = 20000;
export const MAX_REPLICANT_OPTIONS = 500;

// Row budget for the options query: one spare to detect overflow, one more so
// BLANK_SENTINEL never displaces a named value.
export const REPLICANT_OPTIONS_QUERY_LIMIT = MAX_REPLICANT_OPTIONS + 2;

// The cap counts NAMED values. BLANK_SENTINEL is one synthetic row folded from
// the rows that have no value, so letting it consume a slot would flip a
// dimension holding exactly MAX named values to "too_many_values" — the filter
// disappearing entirely, the same failure the blank fold exists to prevent.
export function exceedsMaxReplicantOptions(vals: { id: string }[]): boolean {
  return (
    vals.filter((v) => v.id !== BLANK_SENTINEL).length > MAX_REPLICANT_OPTIONS
  );
}
