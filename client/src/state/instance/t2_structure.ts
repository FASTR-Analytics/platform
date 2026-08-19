import type { FacilityFamily, ItemsHolderStructure } from "lib";
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
