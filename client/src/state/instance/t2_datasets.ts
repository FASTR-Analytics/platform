import {
  APIResponseWithData,
  ItemsHolderDatasetHmisDisplay,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
} from "lib";
import type { ItemsHolderDatasetHfaDisplay } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "../_infra/reactive_cache";

///////////////////////////////////////////////
//  __    __  __       __  ______   ______   //
// /  |  /  |/  \     /  |/      | /      \  //
// $$ |  $$ |$$  \   /$$ |$$$$$$/ /$$$$$$  | //
// $$ |__$$ |$$$  \ /$$$ |  $$ |  $$ \__$$/  //
// $$    $$ |$$$$  /$$$$ |  $$ |  $$      \  //
// $$$$$$$$ |$$ $$ $$/$$ |  $$ |   $$$$$$  | //
// $$ |  $$ |$$ |$$$/ $$ | _$$ |_ /  \__$$ | //
// $$ |  $$ |$$ | $/  $$ |/ $$   |$$    $$/  //
// $$/   $$/ $$/      $$/ $$$$$$/  $$$$$$/   //
//                                           //
///////////////////////////////////////////////

const _DATASET_HMIS_DISPLAY_INFO_CACHE = createReactiveCache<
  {
    rawOrCommonIndicators: IndicatorType;
    facilityColumns: InstanceConfigFacilityColumns;
    versionId: number;
    indicatorMappingsVersion: string;
    maxAdminArea: number;
  },
  ItemsHolderDatasetHmisDisplay
>({
  name: "dataset_hmis_display_info",
  uniquenessKeys: (params) => {
    const fcHash = Object.values(params.facilityColumns).sort().join("_");
    return [params.rawOrCommonIndicators, fcHash];
  },
  versionKey: (params, _pds) =>
    `${params.versionId}_${params.indicatorMappingsVersion}_${params.maxAdminArea}`,
  pdsNotRequired: true,
});

export async function getDatasetHmisDisplayInfoFromCacheOrFetch(
  rawOrCommonIndicators: IndicatorType,
  versionId: number,
  indicatorMappingsVersion: string,
  facilityColumns: InstanceConfigFacilityColumns,
  maxAdminArea: number,
) {
  const { data, version } = await _DATASET_HMIS_DISPLAY_INFO_CACHE.get({
    rawOrCommonIndicators,
    facilityColumns,
    versionId,
    indicatorMappingsVersion,
    maxAdminArea,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDatasetHmisDisplayInfo({
    rawOrCommonIndicators,
    versionId,
    indicatorMappingsVersion,
    facilityColumns,
  });

  _DATASET_HMIS_DISPLAY_INFO_CACHE.setPromise(
    newPromise,
    {
      rawOrCommonIndicators,
      facilityColumns,
      versionId,
      indicatorMappingsVersion,
      maxAdminArea,
    },
    version,
  );

  return await newPromise;
}

///////////////////////////////////
//  __    __  ________  ______   //
// /  |  /  |/        |/      \  //
// $$ |  $$ |$$$$$$$$//$$$$$$  | //
// $$ |__$$ |$$ |__   $$ |__$$ | //
// $$    $$ |$$    |  $$    $$ | //
// $$$$$$$$ |$$$$$/   $$$$$$$$ | //
// $$ |  $$ |$$ |     $$ |  $$ | //
// $$ |  $$ |$$ |     $$ |  $$ | //
// $$/   $$/ $$/      $$/   $$/  //
//                               //
///////////////////////////////////

const _DATASET_HFA_DISPLAY_INFO_CACHE = createReactiveCache<
  {
    cacheHash: string;
  },
  ItemsHolderDatasetHfaDisplay
>({
  name: "dataset_hfa_display_info",
  uniquenessKeys: () => ["hfa"],
  versionKey: (params) => params.cacheHash,
  pdsNotRequired: true,
});

export async function getDatasetHfaDisplayInfoFromCacheOrFetch(
  cacheHash: string,
) {
  const { data, version } = await _DATASET_HFA_DISPLAY_INFO_CACHE.get({
    cacheHash,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDatasetHfaDisplayInfo({});

  _DATASET_HFA_DISPLAY_INFO_CACHE.setPromise(
    newPromise,
    { cacheHash },
    version,
  );

  return await newPromise;
}
