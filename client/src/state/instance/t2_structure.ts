import type { ItemsHolderStructure } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// ============================================================================
// Structure items
// ============================================================================

const _STRUCTURE_ITEMS_CACHE = createReactiveCache<
  {
    structureLastUpdated: string;
    maxAdminArea: number;
    facilityColumnsHash: string;
  },
  ItemsHolderStructure
>({
  name: "instance_structure_items",
  uniquenessKeys: () => ["structure"],
  versionKey: (params) =>
    `${params.structureLastUpdated}_${params.maxAdminArea}_${params.facilityColumnsHash}`,
  pdsNotRequired: true,
});

export async function getStructureItemsFromCacheOrFetch(
  structureLastUpdated: string,
  maxAdminArea: number,
  facilityColumnsHash: string,
) {
  const params = { structureLastUpdated, maxAdminArea, facilityColumnsHash };
  const { data, version } = await _STRUCTURE_ITEMS_CACHE.get(params);
  if (data) return { success: true, data } as const;

  const promise = serverActions.getStructureItems({});
  _STRUCTURE_ITEMS_CACHE.setPromise(promise, params, version);
  return await promise;
}
