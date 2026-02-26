import {
  type APIResponseWithData,
  type ItemsHolderDatasetHmisDisplay,
  type ItemsHolderDatasetHfaDisplay,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
} from "lib";
import { TimCacheC } from "../../valkey/cache_class_C.ts";

export const _FETCH_CACHE_DATASET_HMIS_ITEMS = new TimCacheC<
  {
    rawOrCommonIndicators: IndicatorType;
    facilityColumns: InstanceConfigFacilityColumns;
  },
  { versionId: number; indicatorMappingsVersion: string },
  APIResponseWithData<ItemsHolderDatasetHmisDisplay>
>("ds_hmis", {
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

export const _FETCH_CACHE_DATASET_HFA_ITEMS = new TimCacheC<
  {},
  { versionId: number },
  APIResponseWithData<ItemsHolderDatasetHfaDisplay>
>("ds_hfa", {
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
