import {
  type APIResponseWithData,
  type DisaggregationOption,
  type GenericLongFormFetchConfig,
  hashFetchConfig,
  type ItemsHolderPresentationObject,
  type PresentationObjectDetail,
  type ReplicantOptionsForPresentationObject,
  type ResultsValueInfoForPresentationObject,
} from "lib";
import { TimCacheC } from "../../valkey/cache_class_C.ts";

// Bump when a code change alters the MEANING of a cached results payload (the
// runId key only tracks which immutable run the data came from, not code).
// Folding it into the versionHash invalidates the stale entries exactly once,
// then the caches resume hitting normally.
// "2": quarter_id format YYYY0Q → YYYYQ — pre-cutover results held 6-digit
// quarters that the new renderer (panther) rejects.
// "3": replicant-options now honor the self-column subset filter (get_possible_values
// no longer self-strips), so previously-cached full-value-set payloads are stale.
// "4": replicant-options now resolve RELATIVE period filters to exact bounds
// (and re-anchor from_month) like the items query — previously-cached lists
// for relative-filtered configs span all time.
// "5": hfa_service_category filtering changed from exact-match to set-membership
// (string_to_array overlap) — previously-cached payloads for configs filtering
// on this column used the old (wrong) semantics under an unchanged config hash.
// "6": the PLAN_RESULTS_RUNS cutover — payloads are now sourced from the
// attached run (DuckDB over parquet: native numbers where postgres.js
// returned NUMERIC strings) and possible-values lists are re-sorted in TS
// with a pinned comparator (Intl.Collator en, numeric) so Postgres and DuckDB
// emit identical order — previously-cached entries hold pg-string values and
// DB-collation order.
const PO_CACHE_VERSION = "6";

// The immutable run id replaces the data-version dimensions (PLAN_RESULTS_RUNS
// §2.5): it is the uniqueness scope for the three data caches — two projects
// attached to the same run share entries — and is folded into po_detail's
// version (its payload embeds run-derived resultsValue). Payloads missing a
// runId (the parity rig's Postgres baseline) are never stored.
export type PoDataVersionParams = {
  runId: string;
};

export const _PO_DETAIL_CACHE = new TimCacheC<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
    runId: string;
  },
  APIResponseWithData<PresentationObjectDetail>
  // Prefix is versioned: bump it whenever the cached payload SHAPE or
  // SOURCING changes (the version hash only tracks the row's last_updated +
  // runId, so a deploy that adds a field or re-sources the payload would
  // otherwise keep serving old entries for unmodified rows). v2: resultsValue
  // gained hasFacilityLevelRows. v3: resultsValue now resolves from the run
  // manifest (PLAN_RESULTS_RUNS).
>("po_detail_v3", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.presentationObjectId].join("|"),
  versionHashFromParams: (params) =>
    `${params.presentationObjectLastUpdated}|${params.runId}`,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [res.data.projectId, res.data.id].join("|"),
      versionHash: `${res.data.lastUpdated}|${res.data.runId}`,
    };
  },
});

export const _PO_ITEMS_CACHE = new TimCacheC<
  {
    runId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  PoDataVersionParams,
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.runId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ].join("|"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId,
        res.data.resultsObjectId,
        hashFetchConfig(res.data.fetchConfig),
      ].join("|"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});

export const _METRIC_INFO_CACHE = new TimCacheC<
  {
    runId: string;
    metricId: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.runId, params.metricId].join("::"),
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [res.data.runId, res.data.metricId].join("::"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});

export const _REPLICANT_OPTIONS_CACHE = new TimCacheC<
  {
    runId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
  PoDataVersionParams,
  APIResponseWithData<ReplicantOptionsForPresentationObject>
>("replicant_opts", {
  uniquenessHashFromParams: (params) => {
    return [
      params.runId,
      params.resultsObjectId,
      params.replicateBy,
      hashFetchConfig(params.fetchConfig),
    ].join("::");
  },
  versionHashFromParams: () => PO_CACHE_VERSION,
  parseData: (res) => {
    if (res.success === false || res.data.runId === undefined) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId,
        res.data.resultsObjectId,
        res.data.replicateBy,
        hashFetchConfig(res.data.fetchConfig),
      ].join("::"),
      versionHash: PO_CACHE_VERSION,
    };
  },
});
