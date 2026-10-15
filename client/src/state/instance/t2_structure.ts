import type {
  FacilityFamily,
  HfaRegistryFacility,
  ItemsHolderStructure,
} from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// ============================================================================
// Structure items
// ============================================================================

const _STRUCTURE_ITEMS_CACHE = createReactiveCache<
  {
    family: FacilityFamily;
    structureLastUpdated: string;
    schemaHash: string;
  },
  ItemsHolderStructure
>({
  name: "instance_structure_items",
  uniquenessKeys: (params) => ["structure", params.family],
  versionKey: (params) =>
    `${params.family}_${params.structureLastUpdated}_${params.schemaHash}`,
});

export async function getStructureItemsFromCacheOrFetch(
  family: FacilityFamily,
  structureLastUpdated: string,
  schemaHash: string,
) {
  const params = {
    family,
    structureLastUpdated,
    schemaHash,
  };
  const { data, version } = await _STRUCTURE_ITEMS_CACHE.get(params);
  if (data) return { success: true, data } as const;

  const promise = serverActions.getStructureItems({ family });
  _STRUCTURE_ITEMS_CACHE.setPromise(promise, params, version);
  return await promise;
}

// ============================================================================
// HFA registry
// ============================================================================

// An import can change who set a value without changing the value, which
// leaves the structure stamp alone but moves the HFA dataset hash.
const _HFA_REGISTRY_CACHE = createReactiveCache<
  {
    structureLastUpdated: string;
    hfaCacheHash: string;
    schemaHash: string;
  },
  HfaRegistryFacility[]
>({
  name: "instance_hfa_registry",
  uniquenessKeys: () => ["hfa_registry"],
  versionKey: (params) =>
    [params.structureLastUpdated, params.hfaCacheHash, params.schemaHash].join(
      "_",
    ),
});

export async function getHfaRegistryFromCacheOrFetch(
  structureLastUpdated: string,
  hfaCacheHash: string,
  schemaHash: string,
) {
  const params = {
    structureLastUpdated,
    hfaCacheHash,
    schemaHash,
  };
  const { data, version } = await _HFA_REGISTRY_CACHE.get(params);
  if (data) return { success: true, data } as const;

  const promise = serverActions.getHfaRegistry({});
  _HFA_REGISTRY_CACHE.setPromise(promise, params, version);
  return await promise;
}
