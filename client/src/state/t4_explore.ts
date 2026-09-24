import { MODULE_FAMILY_ORDER, type DatasetType, type GridQuery } from "lib";
import { createSignal } from "solid-js";

// The Explore page's selections, module level so they outlive the page's
// mount. Each is resolved against the current package on every read, so a
// choice the package cannot answer falls back without being overwritten.
// The family, the module per family and the view per module persist in
// localStorage; the package, the area and the query controls last the
// session, since a stored package id could outlive its package.

function readStored<T extends string>(key: string): Record<string, T> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (typeof parsed !== "object" || parsed === null) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, T] =>
        typeof e[1] === "string"
      ),
    );
  } catch {
    return {};
  }
}

function storedFamily(): DatasetType {
  const v = localStorage.getItem("exploreFamily");
  return MODULE_FAMILY_ORDER.find((f) => f === v) ?? "hmis";
}

export const [exploreFamily, setExploreFamilyInternal] = createSignal<
  DatasetType
>(storedFamily());
export function setExploreFamily(family: DatasetType) {
  localStorage.setItem("exploreFamily", family);
  setExploreFamilyInternal(family);
}

type ModulesByFamily = Partial<Record<DatasetType, string>>;
export const [exploreModules, setExploreModulesInternal] = createSignal<
  ModulesByFamily
>(readStored("exploreModules"));
export function setExploreModule(family: DatasetType, moduleId: string) {
  const next = { ...exploreModules(), [family]: moduleId };
  localStorage.setItem("exploreModules", JSON.stringify(next));
  setExploreModulesInternal(next);
}

export const [exploreViews, setExploreViewsInternal] = createSignal<
  Record<string, string>
>(readStored("exploreViews"));
export function setExploreView(moduleId: string, viewId: string) {
  const next = { ...exploreViews(), [moduleId]: viewId };
  localStorage.setItem("exploreViews", JSON.stringify(next));
  setExploreViewsInternal(next);
}

export const [explorePackageId, setExplorePackageId] = createSignal<
  string | null
>(null);

export const [exploreAdminArea2, setExploreAdminArea2] = createSignal<
  string | null
>(null);

type QueriesByFamily = Partial<Record<DatasetType, GridQuery>>;
export const [exploreQueries, setExploreQueriesInternal] = createSignal<
  QueriesByFamily
>({});
export function setExploreQuery(family: DatasetType, query: GridQuery) {
  setExploreQueriesInternal({ ...exploreQueries(), [family]: query });
}
