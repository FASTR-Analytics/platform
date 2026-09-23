import type { SortMode } from "lib";

export function sortBySortMode<T>(
  items: readonly T[],
  mode: SortMode,
  getName: (item: T) => string,
  getDate: (item: T) => string | undefined,
): T[] {
  const byName = (a: T, b: T) =>
    getName(a).localeCompare(getName(b), undefined, { sensitivity: "base" });
  if (mode === "name") {
    return [...items].sort(byName);
  }
  return [...items].sort((a, b) => {
    const da = getDate(a);
    const db = getDate(b);
    if (da === undefined && db === undefined) {
      return byName(a, b);
    }
    if (da === undefined) {
      return 1;
    }
    if (db === undefined) {
      return -1;
    }
    const cmp = db.localeCompare(da);
    return cmp !== 0 ? cmp : byName(a, b);
  });
}
