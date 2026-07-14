import {
  type APIResponseWithData,
  type ItemsHolderDatasetHmisDisplay,
  type ItemsHolderDatasetHfaDisplay,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
  hashFacilityColumnsConfig,
} from "lib";
import { TimCacheC } from "../../valkey/cache_class_C.ts";

export const _FETCH_CACHE_DATASET_HMIS_ITEMS = new TimCacheC<
  {
    rawOrCommonIndicators: IndicatorType;
    facilityColumns: InstanceConfigFacilityColumns;
  },
  { versionId: number; indicatorMappingsVersion: string },
  // Prefix bumped ds_hmis → ds_hmis_v2 when the source of vizItems switched
  // to the import ledger (common-view count semantics changed) — old-shape
  // cached payloads for unmodified versions must not survive the deploy.
  APIResponseWithData<ItemsHolderDatasetHmisDisplay>
>("ds_hmis_v2", {
  uniquenessHashFromParams: (params) => {
    const fcHash = hashFacilityColumnsConfig(params.facilityColumns);
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
    const fcHash = hashFacilityColumnsConfig(res.data.facilityColumns);
    return {
      shouldStore: true,
      uniquenessHash: `${res.data.rawOrCommonIndicators}_${fcHash}`,
      versionHash: `${res.data.versionId}_${res.data.indicatorMappingsVersion}`,
    };
  },
});

export const _FETCH_CACHE_DATASET_HFA_ITEMS = new TimCacheC<
  {},
  { hash: string },
  APIResponseWithData<ItemsHolderDatasetHfaDisplay>
>("ds_hfa", {
  uniquenessHashFromParams: () => "hfa",
  versionHashFromParams: (params) => params.hash,
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
      versionHash: res.data.cacheHash,
    };
  },
});
