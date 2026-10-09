import type { HfaTimePoint } from "../types/dataset_hfa.ts";
import type { HfaTaxonomyForAI } from "../types/hfa_types.ts";

// The HFA survey rounds both AI surfaces list: the rounds with data, in the
// order given, each named by its label (the time_point value in data and
// filters).
export function hfaTimePointsForAI(
  timePoints: HfaTimePoint[],
): HfaTaxonomyForAI["timePoints"] {
  return timePoints
    .filter((tp) => tp.importedAt !== undefined)
    .map((tp) => ({ id: tp.label, label: tp.label, periodId: tp.periodId }));
}
