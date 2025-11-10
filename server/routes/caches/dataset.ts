import {
  APIResponseWithData,
  ItemsHolderDatasetHmisDisplay,
  ItemsHolderDatasetHfaDisplay,
  TimCacheB,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
} from "lib";

export const _FETCH_CACHE_DATASET_HMIS_ITEMS = new TimCacheB<
  {
    rawOrCommonIndicators: IndicatorType;
    facilityColumns: InstanceConfigFacilityColumns;
  },
  { versionId: number; indicatorMappingsVersion: string },
  APIResponseWithData<ItemsHolderDatasetHmisDisplay>
>({
  uniquenessHashFromParams: (params) => {
    const fcHash = Object.values(params.facilityColumns).sort().join("_");
    return `${params.rawOrCommonIndicators}_${fcHash}`;
  },
  versionHashFromParams: (params) => {
    return `${params.versionId}_${params.indicatorMappingsVersion}`;
  },
  parseData: (res) => {
    if (res.success === false) {
      return {
        shouldStore: false,
        uniquenessHash: "",
        versionHash: "",
      };
    }
    const fcHash = Object.values(res.data.facilityColumns).sort().join("_");
    return {
      shouldStore: true,
      uniquenessHash: `${res.data.rawOrCommonIndicators}_${fcHash}`,
      versionHash: `${res.data.versionId}_${res.data.indicatorMappingsVersion}`,
    };
  },
});

export const _FETCH_CACHE_DATASET_HFA_ITEMS = new TimCacheB<
  {},
  { versionId: number },
  APIResponseWithData<ItemsHolderDatasetHfaDisplay>
>({
  uniquenessHashFromParams: () => "hfa",
  versionHashFromParams: (params) => `${params.versionId}`,
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
      uniquenessHash: "hfa",
      versionHash: `${res.data.versionId}`,
    };
  },
});
