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

// Bump when a code change alters the MEANING of a cached results payload without
// bumping moduleLastRun/datasetsVersion (which only track data/run changes, not
// code). Folding it into the versionHash invalidates the stale entries exactly
// once, then the caches resume hitting normally.
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
// "6": possible-values lists are re-sorted in TS with a pinned comparator
// (Intl.Collator en, numeric) so Postgres and DuckDB emit identical order —
// previously-cached lists hold DB-collation order (PLAN_RESULTS_RUNS §2.4).
const PO_CACHE_VERSION = "6";

// Under RESULTS_READ_PATH=runs (PLAN_RESULTS_RUNS §2.5) the immutable run id
// replaces the data-version dimensions: it becomes the uniqueness scope for
// the three data caches (two projects on the same run share entries) and is
// folded into po_detail's version (its payload embeds run-derived
// resultsValue). Legacy and run entries coexist under the same prefixes —
// their key/version strings can never collide.
function dataVersionHash(
  params: { moduleLastRun: string; datasetsVersion: string } | { runId: string },
): string {
  return "runId" in params
    ? PO_CACHE_VERSION
    : `${PO_CACHE_VERSION}|${params.moduleLastRun}|${params.datasetsVersion}`;
}

function dataVersionHashFromPayload(payload: {
  moduleLastRun: string;
  datasetsVersion: string;
  runId?: string;
}): string {
  return payload.runId !== undefined
    ? PO_CACHE_VERSION
    : `${PO_CACHE_VERSION}|${payload.moduleLastRun}|${payload.datasetsVersion}`;
}

export type PoDataVersionParams =
  | { moduleLastRun: string; datasetsVersion: string }
  | { runId: string };

export const _PO_DETAIL_CACHE = new TimCacheC<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
    runId?: string;
  },
  APIResponseWithData<PresentationObjectDetail>
  // Prefix is versioned: bump it whenever the cached payload SHAPE changes
  // (the version hash only tracks the row's last_updated, so a deploy that
  // adds a field — e.g. resultsValue.hasFacilityLevelRows in v2 — would
  // otherwise keep serving old-shape payloads for unmodified rows).
>("po_detail_v2", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.presentationObjectId].join("|"),
  versionHashFromParams: (params) =>
    params.runId !== undefined
      ? `${params.presentationObjectLastUpdated}|${params.runId}`
      : params.presentationObjectLastUpdated,
  parseData: (res) => {
    if (res.success === false) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [res.data.projectId, res.data.id].join("|"),
      versionHash: res.data.runId !== undefined
        ? `${res.data.lastUpdated}|${res.data.runId}`
        : res.data.lastUpdated,
    };
  },
});

export const _PO_ITEMS_CACHE = new TimCacheC<
  {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    runId?: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.runId ?? params.projectId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ].join("|"),
  versionHashFromParams: dataVersionHash,
  parseData: (res) => {
    if (res.success === false) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId ?? res.data.projectId,
        res.data.resultsObjectId,
        hashFetchConfig(res.data.fetchConfig),
      ].join("|"),
      versionHash: dataVersionHashFromPayload(res.data),
    };
  },
});

export const _METRIC_INFO_CACHE = new TimCacheC<
  {
    projectId: string;
    metricId: string;
    runId?: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.runId ?? params.projectId, params.metricId].join("::"),
  versionHashFromParams: dataVersionHash,
  parseData: (res) => {
    if (res.success === false) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId ?? res.data.projectId,
        res.data.metricId,
      ].join("::"),
      versionHash: dataVersionHashFromPayload(res.data),
    };
  },
});

export const _REPLICANT_OPTIONS_CACHE = new TimCacheC<
  {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
    runId?: string;
  },
  PoDataVersionParams,
  APIResponseWithData<ReplicantOptionsForPresentationObject>
>("replicant_opts", {
  uniquenessHashFromParams: (params) => {
    return [
      params.runId ?? params.projectId,
      params.resultsObjectId,
      params.replicateBy,
      hashFetchConfig(params.fetchConfig),
    ].join("::");
  },
  versionHashFromParams: dataVersionHash,
  parseData: (res) => {
    if (res.success === false) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    return {
      shouldStore: true,
      uniquenessHash: [
        res.data.runId ?? res.data.projectId,
        res.data.resultsObjectId,
        res.data.replicateBy,
        hashFetchConfig(res.data.fetchConfig),
      ].join("::"),
      versionHash: dataVersionHashFromPayload(res.data),
    };
  },
});
