import { MODULE_FAMILY_ORDER } from "./group_metrics.ts";
import type { DatasetType } from "./types/mod.ts";

// A package's families from its manifest's dataset types, in family order;
// a type that is not a family is dropped.
export function familiesOfDatasetTypes(
  types: readonly string[],
): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) => types.includes(family));
}
