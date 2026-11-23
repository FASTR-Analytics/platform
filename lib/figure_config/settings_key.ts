import { effectiveReplicant, groupedDims, openRollup } from "./derive.ts";
import type { FigureConfigBody, FigurePeriodFilter } from "./schema.ts";

// The settings a figure's rows answer, as a canonical string: what the query
// reads and nothing of how the rows are laid out or drawn. It is built from
// the metric id and the config alone, so a place that holds only a stored
// figure can build it. Two configs of one metric that read two queries hold
// two keys; two that read one query hold two keys where one names every value
// prop and the other none, where they name different value props of a metric
// whose query reads all of them (one with a post-aggregation expression or
// catalog evaluation), or where the package cannot total a roll-up.
export function settingsKey(
  metricId: string,
  config: FigureConfigBody,
): string {
  const sorted = (values: readonly (string | number)[]) =>
    values.map(String).sort();
  const filters: [string, (string | null)[]][] = config.data.filters.map((
    f,
  ) => [f.dim, sorted(f.values)]);
  // The replicant's value is a filter of one value on its dimension, unless a
  // filter already holds that dimension to one value.
  const replicant = effectiveReplicant(config);
  if (replicant !== undefined) {
    filters.push([replicant.dim, [replicant.value ?? null]]);
  }
  filters.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return JSON.stringify([
    metricId,
    config.data.valueProps === undefined
      ? null
      : [...config.data.valueProps].sort(),
    filters,
    canonicalPeriodFilter(config.data.periodFilter),
    groupedDims(config).sort(),
    openRollup(config)?.dim ?? null,
  ]);
}

function canonicalPeriodFilter(
  pf: FigurePeriodFilter | undefined,
): (string | number)[] | null {
  if (pf === undefined) return null;
  switch (pf.type) {
    case "range":
      return [pf.type, pf.min, pf.max];
    case "from":
      return [pf.type, pf.min];
    case "last":
    case "lastFull":
      return [pf.type, pf.n, pf.unit];
  }
}
