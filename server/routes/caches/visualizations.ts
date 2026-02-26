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

export const _PO_DETAIL_CACHE = new TimCacheC<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
  },
  APIResponseWithData<PresentationObjectDetail>
>("po_detail", {
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
  },
  APIResponseWithData<ItemsHolderPresentationObject>
>("po_items", {
  uniquenessHashFromParams: (params) =>
    [
      params.projectId,
      params.resultsObjectId,
      hashFetchConfig(params.fetchConfig),
    ].join("|"),
  versionHashFromParams: (params) => params.moduleLastRun,
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
      versionHash: res.data.moduleLastRun,
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
  },
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>("metric_info", {
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.metricId].join("::"),
  versionHashFromParams: (params) => params.moduleLastRun,
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
      versionHash: res.data.moduleLastRun,
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
  versionHashFromParams: (params) => params.moduleLastRun,
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
      versionHash: res.data.moduleLastRun,
    };
  },
});
