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
  // v2: payload gained definition/format_as/thresholds/sort_order (PLAN_1a).
  // v3: thresholds became a CF rule and group_label went (PLAN_1d). v4: one
  // list of count and derived indicators (PLAN_A3). v5: one table, the
  // definition carrying members, include_in_analysis (PLAN_A4). v6: the
  // four types, the definition carrying data_id (PLAN_A5). v7: direction,
  // target and expected_low_counts.
  // The name is the client's cache-prefix lever: the version hash cannot
  // invalidate a pure shape change, so a changed payload shape bumps the
  // name, exactly as a server Valkey prefix would.
  name: "instance_indicators_v7",
  uniquenessKeys: () => ["indicators"],
  versionKey: (params) => params.indicatorsVersion,
  pdsNotRequired: true,
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
