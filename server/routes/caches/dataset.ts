import {
  type APIResponseWithData,
  type ItemsHolderDatasetHfaDisplay,
} from "lib";
import { TimCacheC } from "../../valkey/cache_class_C.ts";

// The HMIS display cache (ds_hmis / ds_hmis_v2) was deleted 2026-07-15: once
// vizItems moved to the import ledger the read became a few ms, and the cache
// only added liabilities (mid-run bypass, prefix-bump-on-shape-change).
// getDatasetHmisDisplayInfo now computes live; client T2 IndexedDB caching
// remains.

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
