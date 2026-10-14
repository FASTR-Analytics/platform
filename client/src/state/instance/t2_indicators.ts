import type { HfaIndicator, InstanceIndicatorDetails } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

// ============================================================================
// Indicators
// ============================================================================

const _INDICATORS_CACHE = createReactiveCache<
  { indicatorsVersion: string },
  InstanceIndicatorDetails
>({
  // The name is the client's cache-prefix lever: the version hash cannot
  // invalidate a pure shape change, so a changed payload shape bumps the
  // name, exactly as a server Valkey prefix would.
  name: "instance_indicators_v7",
  uniquenessKeys: () => ["indicators"],
  versionKey: (params) => params.indicatorsVersion,
});

export async function getIndicatorsFromCacheOrFetch(
  indicatorsVersion: string,
) {
  const { data, version } = await _INDICATORS_CACHE.get({
    indicatorsVersion,
  });
  if (data) return { success: true, data } as const;

  const promise = serverActions.getIndicators({});
  _INDICATORS_CACHE.setPromise(promise, { indicatorsVersion }, version);
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
