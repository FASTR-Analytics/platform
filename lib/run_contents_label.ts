import { MODULE_FAMILY_ORDER } from "./group_metrics.ts";
import type { DatasetType } from "./types/mod.ts";

export function familiesOfDatasetTypes(
  types: readonly string[],
): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) => types.includes(family));
}
