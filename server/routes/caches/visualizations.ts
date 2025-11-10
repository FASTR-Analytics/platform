import {
  APIResponseWithData,
  DisaggregationOption,
  GenericLongFormFetchConfig,
  hashFetchConfig,
  ItemsHolderPresentationObject,
  PresentationObjectDetail,
  ReplicantOptionsForPresentationObject,
  ResultsValueInfoForPresentationObject,
  TimCacheB,
} from "lib";

export const _PO_DETAIL_CACHE = new TimCacheB<
  {
    projectId: string;
    presentationObjectId: string;
  },
  {
    presentationObjectLastUpdated: string;
  },
  APIResponseWithData<PresentationObjectDetail>
>({
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

export const _PO_ITEMS_CACHE = new TimCacheB<
  {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
  },
  {
    moduleLastRun: string;
  },
  APIResponseWithData<ItemsHolderPresentationObject>
>({
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

export const _RESULTS_VALUE_INFO_CACHE = new TimCacheB<
  {
    projectId: string;
    resultsValueId: string;
  },
  {
    moduleLastRun: string;
  },
  APIResponseWithData<ResultsValueInfoForPresentationObject>
>({
  uniquenessHashFromParams: (params) =>
    [params.projectId, params.resultsValueId].join("::"),
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
        res.data.resultsValueId,
      ].join("::"),
      versionHash: res.data.moduleLastRun,
    };
  },
});

export const _REPLICANT_OPTIONS_CACHE = new TimCacheB<
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
>({
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
      shouldStore: false,
      uniquenessHash: "",
      versionHash: "",
    };
  },
});
