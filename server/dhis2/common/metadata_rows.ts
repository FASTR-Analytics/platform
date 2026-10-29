import { type FetchOptions, getDHIS2 } from "./base_fetcher.ts";

// The endpoints read by an in-filter; each answers under its own name.
export type MetadataEndpoint =
  | "dataElements"
  | "indicators"
  | "categoryOptionCombos"
  | "dataSets";

// DHIS2 caps a filter's value list, so the values go in chunks.
const IN_FILTER_CHUNK_SIZE = 100;

// The rows of a metadata endpoint whose `property` is one of `values`: one
// unpaged `property:in:[...]` request per chunk of 100 distinct values, the
// chunks' rows concatenated. A row matched by values in two chunks is
// returned once per chunk.
export async function getMetadataRows<T>(
  endpoint: MetadataEndpoint,
  filter: { property: string; values: Iterable<string> },
  fields: string,
  options: FetchOptions,
): Promise<T[]> {
  const rows: T[] = [];
  const distinct = Array.from(new Set(filter.values));
  for (let i = 0; i < distinct.length; i += IN_FILTER_CHUNK_SIZE) {
    const chunk = distinct.slice(i, i + IN_FILTER_CHUNK_SIZE);
    const params = new URLSearchParams();
    params.set("fields", fields);
    params.set("filter", `${filter.property}:in:[${chunk.join(",")}]`);
    params.set("paging", "false");
    const res = await getDHIS2<Record<string, T[] | null | undefined>>(
      `/api/${endpoint}.json`,
      options,
      params,
    );
    rows.push(...(res[endpoint] ?? []));
  }
  return rows;
}
