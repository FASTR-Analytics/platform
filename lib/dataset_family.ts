// Which dataset family a module belongs to, derived from its stored definition
// JSON. Pure string parsing, so it lives here rather than beside the DB helpers
// that read the definition row — the query builders, the metric enricher and
// the route layer all need it, from different sides of the db/ boundary.

import type { DatasetType } from "./types/datasets.ts";

type ModuleDataSource = {
  sourceType: string;
  datasetType?: string;
};

export function getDatasetTypes(moduleDefinition: string): string[] {
  try {
    const parsed = JSON.parse(moduleDefinition);
    const dataSources = (parsed.dataSources ?? []) as ModuleDataSource[];
    return dataSources
      .filter((ds) => ds.sourceType === "dataset" && ds.datasetType)
      .map((ds) => ds.datasetType!);
  } catch {
    return [];
  }
}

// A module with more than one dataset type has no single family. HFA is
// recognised by its script generation type: the module reads the HFA dataset
// through a generated script rather than declaring it as a data source.
export function getDatasetFamily(
  moduleDefinition: string,
): DatasetType | undefined {
  try {
    if (JSON.parse(moduleDefinition).scriptGenerationType === "hfa") {
      return "hfa";
    }
  } catch {
    return undefined;
  }
  const types = new Set(getDatasetTypes(moduleDefinition));
  if (types.size !== 1) return undefined;
  const only = [...types][0];
  return only === "hmis" || only === "hfa" || only === "iceh" ? only : undefined;
}
