import type { ListSort, SortMode } from "lib";

// Name reads A to Z first; recent reads newest first.
export function defaultSort(mode: SortMode): ListSort {
  return { mode, direction: mode === "name" ? "asc" : "desc" };
}

// Clicking the active header reverses it; clicking the other one starts it
// in its default direction.
export function nextSort(current: ListSort, mode: SortMode): ListSort {
  if (current.mode !== mode) return defaultSort(mode);
  return { mode, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function sortBySortMode<T>(
  items: readonly T[],
  sort: ListSort,
  getName: (item: T) => string,
  getDate: (item: T) => string | undefined,
): T[] {
  const sign = sort.direction === "asc" ? 1 : -1;
  const byName = (a: T, b: T) =>
    getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
  if (sort.mode === "name") {
    return [...items].sort((a, b) => sign * byName(a, b));
  }
  // An item without a date sorts last in either direction.
  return [...items].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    if (da === undefined && db === undefined) return byName(a, b);
    if (da === undefined) return 1;
    if (db === undefined) return -1;
    const cmp = da.localeCompare(db);
    return cmp !== 0 ? sign * cmp : byName(a, b);
  });
}
