import type { PopulationTypeStore } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// One population type's grid (structure areas × years), keyed by the
// `population_last_updated` stamp every store write bumps AND the structure
// stamp, since the rows are laid out against the HMIS structure at the
// population level.
const _POPULATION_TYPE_STORE_CACHE = createReactiveCache<
  {
    populationType: string;
    populationLastUpdated: string | undefined;
    structureLastUpdated: string | undefined;
  },
  PopulationTypeStore
>({
  name: "instance_population_type_store",
  uniquenessKeys: (params) => ["population_type_store", params.populationType],
  versionKey: (params) =>
    `${params.populationLastUpdated ?? "no-population"}_${
      params.structureLastUpdated ?? "no-structure"
    }`,
  pdsNotRequired: true,
});

export async function getPopulationTypeStoreFromCacheOrFetch(
  populationType: string,
  populationLastUpdated: string | undefined,
  structureLastUpdated: string | undefined,
) {
  const params = { populationType, populationLastUpdated, structureLastUpdated };
  const { data, version } = await _POPULATION_TYPE_STORE_CACHE.get(params);
  if (data) return { success: true, data } as const;

  const promise = serverActions.getPopulationTypeStore({ populationType });
  _POPULATION_TYPE_STORE_CACHE.setPromise(promise, params, version);
  return await promise;
}
