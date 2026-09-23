import type { JsonArrayItem } from "./types/_figure_bundle.ts";
import type { IndicatorMetadataDisplay } from "./types/indicators.ts";
import type {
  GenericLongFormFetchConfig,
  PeriodBounds,
} from "./types/presentation_objects.ts";

// The grid read's payload: the items read's rows, dictionary-encoded so a
// view of hundreds of thousands of cells stays a fraction of the long-form
// size. `levels[g]` holds groupBy g's distinct values, in `groupBys` order;
// `rows[r][g]` indexes into it. `valueProps` are every returned column that
// is not a groupBy (the metric's value, and any __n_* column), because a
// fetch config's `values` name ingredients, not the columns that come back;
// `values[r][v]` is row r's `valueProps[v]`. Cells keep the type SQL gave
// them, so decoding reproduces the items read's rows exactly.
export type GridCell = JsonArrayItem[string];

export type GridItemsEncoded = {
  levels: GridCell[][];
  rows: number[][];
  valueProps: string[];
  values: GridCell[][];
};

export type GridItemsHolder =
  & {
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    runId: string;
    scopeToken: string;
    dateRange: PeriodBounds | undefined;
  }
  & (
    | (GridItemsEncoded & {
      status: "ok";
      indicatorMetadata: IndicatorMetadataDisplay[];
    })
    | { status: "too_many_cells" }
    | { status: "no_data_available" }
  );

export function encodeGridItems(
  items: JsonArrayItem[],
  groupBys: string[],
): GridItemsEncoded {
  const grouped = new Set(groupBys);
  const valueProps = Object.keys(items[0] ?? {}).filter((k) =>
    !grouped.has(k)
  );
  const indexes = groupBys.map(() => new Map<GridCell, number>());
  const levels: GridCell[][] = groupBys.map(() => []);
  const rows = items.map((item) =>
    groupBys.map((groupBy, g) => {
      const value = item[groupBy] ?? null;
      const index = indexes[g].get(value);
      if (index !== undefined) return index;
      indexes[g].set(value, levels[g].length);
      levels[g].push(value);
      return levels[g].length - 1;
    })
  );
  const values = items.map((item) =>
    valueProps.map((prop) => item[prop] ?? null)
  );
  return { levels, rows, valueProps, values };
}

export function decodeGridItems(
  encoded: GridItemsEncoded,
  groupBys: string[],
): JsonArrayItem[] {
  return encoded.rows.map((row, r) => {
    const item: JsonArrayItem = {};
    groupBys.forEach((groupBy, g) => {
      item[groupBy] = encoded.levels[g][row[g]];
    });
    encoded.valueProps.forEach((prop, v) => {
      item[prop] = encoded.values[r][v];
    });
    return item;
  });
}
