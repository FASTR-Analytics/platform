import { getModuleFamilyLabel, MODULE_FAMILY_ORDER } from "./group_metrics.ts";
import type { DatasetType } from "./types/mod.ts";

export function familiesOfDatasetTypes(
  types: readonly string[],
): DatasetType[] {
  return MODULE_FAMILY_ORDER.filter((family) => types.includes(family));
}

export type PackageContents = {
  families: readonly DatasetType[] | null;
  moduleCount: number | null;
};

export function packageFamiliesLabel(
  families: readonly DatasetType[] | null,
): string {
  return (families ?? []).map(getModuleFamilyLabel).join("+");
}

// Every character counts here: the label sits beside a package's own label
// in pickers, so the count's unit is one letter that reads the same in every
// app language.
export function packageContentsLabel(contents: PackageContents): string {
  return [
    packageFamiliesLabel(contents.families),
    contents.moduleCount === null ? "" : `${contents.moduleCount}m`,
  ].filter((part) => part !== "").join(" ");
}

export function packageDisplayLabel(
  pkg: PackageContents & { label: string },
): string {
  return [pkg.label, packageContentsLabel(pkg)]
    .filter((part) => part !== "").join(" ");
}
