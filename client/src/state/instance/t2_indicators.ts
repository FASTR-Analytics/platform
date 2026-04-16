import type {
  HfaIndicator,
  InstanceIndicatorDetails,
  CalculatedIndicator,
} from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

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
  _INDICATORS_CACHE.setPromise(promise, { indicatorMappingsVersion }, version);
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
  _HFA_INDICATORS_CACHE.setPromise(promise, { hfaIndicatorsVersion }, version);
  return await promise;
}

// ============================================================================
// Calculated indicators
// ============================================================================

const _CALCULATED_INDICATORS_CACHE = createReactiveCache<
  { calculatedIndicatorsVersion: string },
  CalculatedIndicator[]
>({
  name: "instance_calculated_indicators",
  uniquenessKeys: () => ["calculated_indicators"],
  versionKey: (params) => params.calculatedIndicatorsVersion,
  pdsNotRequired: true,
});

export async function getCalculatedIndicatorsFromCacheOrFetch(
  calculatedIndicatorsVersion: string,
) {
  const { data, version } = await _CALCULATED_INDICATORS_CACHE.get({
    calculatedIndicatorsVersion,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getCalculatedIndicators({});
  _CALCULATED_INDICATORS_CACHE.setPromise(
    promise,
    { calculatedIndicatorsVersion },
    version,
  );
  return await promise;
}
