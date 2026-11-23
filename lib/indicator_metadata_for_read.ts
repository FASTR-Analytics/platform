// The catalog entries a read or a stored figure names: those whose id equals,
// as text, a cell of one of its rows or a value it is filtered by. A figure
// looks an entry up by a cell (labels, axis order, the facts of the
// indicators on display) or by a filter value, since an indicator a filter
// pins has no column in the rows. The test is wide on purpose: a cell that
// equals an id by coincidence keeps an entry nothing looks up, which costs
// one entry and breaks nothing. Kept entries stay in the catalog's order.
export function indicatorMetadataForRead<T extends { id: string }>(
  catalog: readonly T[],
  rows: readonly Readonly<Record<string, unknown>>[],
  filterValues: readonly (string | number)[],
): T[] {
  const named = new Set(filterValues.map(String));
  for (const row of rows) {
    for (const cell of Object.values(row)) {
      if (cell !== null && cell !== undefined) named.add(String(cell));
    }
  }
  return catalog.filter((entry) => named.has(entry.id));
}
