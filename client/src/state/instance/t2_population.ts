import type { PopulationRow } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// The population store's rows (the manager page's table), keyed by the
// `population_last_updated` stamp every store write bumps — the
// `stamp → population_updated SSE → cache` triangle.
const _POPULATION_ROWS_CACHE = createReactiveCache<
  { populationLastUpdated: string },
  PopulationRow[]
>({
  name: "instance_population_rows",
  uniquenessKeys: () => ["population_rows"],
  versionKey: (params) => params.populationLastUpdated,
  pdsNotRequired: true,
});

export async function getPopulationRowsFromCacheOrFetch(
  populationLastUpdated: string,
) {
  const { data, version } = await _POPULATION_ROWS_CACHE.get({
    populationLastUpdated,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getPopulationRows({});
  _POPULATION_ROWS_CACHE.setPromise(
    promise,
    { populationLastUpdated },
    version,
  );
  return await promise;
}
