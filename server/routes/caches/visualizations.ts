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
const PO_CACHE_VERSION = "2";

export const _PO_DETAIL_CACHE = new TimCacheC<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
  },
  APIResponseWithData<PresentationObjectDetail>
  // Prefix is versioned: bump it whenever the cached payload SHAPE changes
  // (the version hash only tracks the row's last_updated, so a deploy that
  // adds a field — e.g. resultsValue.hasFacilityLevelRows in v2 — would
  // otherwise keep serving old-shape payloads for unmodified rows).
>("po_detail_v2", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.presentationObjectId].join("|"),
  versionHashFromParams: (params) => params.presentationObjectLastUpdated,
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
      versionHash: res.data.lastUpdated,
    };
  },
});

export const _PO_ITEMS_CACHE = new TimCacheC<
  {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  {
    moduleLastRun: string;
    datasetsVersion: string;
  },
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.projectId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ].join("|"),
  versionHashFromParams: (params) =>
    `${PO_CACHE_VERSION}|${params.moduleLastRun}|${params.datasetsVersion}`,
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
        res.data.projectId,
        res.data.resultsObjectId,
        hashFetchConfig(res.data.fetchConfig),
      ].join("|"),
      versionHash: `${PO_CACHE_VERSION}|${res.data.moduleLastRun}|${res.data.datasetsVersion}`,
    };
  },
});

export const _METRIC_INFO_CACHE = new TimCacheC<
  {
    projectId: string;
    metricId: string;
  },
  {
    moduleLastRun: string;
    datasetsVersion: string;
  },
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.metricId].join("::"),
  versionHashFromParams: (params) =>
    `${PO_CACHE_VERSION}|${params.moduleLastRun}|${params.datasetsVersion}`,
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
        res.data.projectId,
        res.data.metricId,
      ].join("::"),
      versionHash: `${PO_CACHE_VERSION}|${res.data.moduleLastRun}|${res.data.datasetsVersion}`,
    };
  },
});

export const _REPLICANT_OPTIONS_CACHE = new TimCacheC<
  {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
  },
  {
    moduleLastRun: string;
    datasetsVersion: string;
  },
  APIResponseWithData<ReplicantOptionsForPresentationObject>
>("replicant_opts", {
  uniquenessHashFromParams: (params) => {
    return [
      params.projectId,
      params.resultsObjectId,
      params.replicateBy,
      hashFetchConfig(params.fetchConfig),
    ].join("::");
  },
  versionHashFromParams: (params) =>
    `${PO_CACHE_VERSION}|${params.moduleLastRun}|${params.datasetsVersion}`,
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
        res.data.projectId,
        res.data.resultsObjectId,
        res.data.replicateBy,
        hashFetchConfig(res.data.fetchConfig),
      ].join("::"),
      versionHash: `${PO_CACHE_VERSION}|${res.data.moduleLastRun}|${res.data.datasetsVersion}`,
    };
  },
});
