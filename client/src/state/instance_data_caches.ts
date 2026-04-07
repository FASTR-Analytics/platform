import type {
  HfaIndicator,
  InstanceIndicatorDetails,
  ItemsHolderStructure,
} from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "./caches/reactive_cache";

// ============================================================================
// Indicators (common + raw with mappings)
// ============================================================================

const _INDICATORS_CACHE = createReactiveCache<
  { indicatorMappingsVersion: string },
  InstanceIndicatorDetails
>({
  name: "instance_indicators",
  uniquenessKeys: () => ["indicators"],
  versionKey: (params) => params.indicatorMappingsVersion,
  pdsNotRequired: true,
});

export async function getIndicatorsFromCacheOrFetch(
  indicatorMappingsVersion: string,
) {
  const { data, version } = await _INDICATORS_CACHE.get({
    indicatorMappingsVersion,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getIndicators({});
  _INDICATORS_CACHE.setPromise(
    promise,
    { indicatorMappingsVersion },
    version,
  );
  return await promise;
}

// ============================================================================
// HFA Indicators
// ============================================================================

const _HFA_INDICATORS_CACHE = createReactiveCache<
  { hfaIndicatorsVersion: string },
  HfaIndicator[]
>({
  name: "instance_hfa_indicators",
  uniquenessKeys: () => ["hfa_indicators"],
  versionKey: (params) => params.hfaIndicatorsVersion,
  pdsNotRequired: true,
});

export async function getHfaIndicatorsFromCacheOrFetch(
  hfaIndicatorsVersion: string,
) {
  const { data, version } = await _HFA_INDICATORS_CACHE.get({
    hfaIndicatorsVersion,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getHfaIndicators({});
  _HFA_INDICATORS_CACHE.setPromise(
    promise,
    { hfaIndicatorsVersion },
    version,
  );
  return await promise;
}

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
