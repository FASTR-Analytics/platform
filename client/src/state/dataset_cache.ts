import {
  APIResponseWithData,
  ItemsHolderDatasetHmisDisplay,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
} from "lib";
import type { ItemsHolderDatasetHfaDisplay } from "lib";
import { serverActions } from "~/server_actions";
import { createReactiveCache } from "./caches/reactive_cache";

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
  },
  ItemsHolderDatasetHmisDisplay
>({
  name: "dataset_hmis_display_info",
  uniquenessKeys: (params) => {
    const fcHash = Object.values(params.facilityColumns).sort().join("_");
    return [params.rawOrCommonIndicators, fcHash];
  },
  versionKey: (params, _pds) =>
    `${params.versionId}_${params.indicatorMappingsVersion}`,
  pdsNotRequired: true,
});

export async function getDatasetHmisDisplayInfoFromCacheOrFetch(
  rawOrCommonIndicators: IndicatorType,
  versionId: number,
  indicatorMappingsVersion: string,
  facilityColumns: InstanceConfigFacilityColumns,
) {
  const { data, version } = await _DATASET_HMIS_DISPLAY_INFO_CACHE.get({
    rawOrCommonIndicators,
    facilityColumns,
    versionId,
    indicatorMappingsVersion,
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
    versionId: number;
  },
  ItemsHolderDatasetHfaDisplay
>({
  name: "dataset_hfa_display_info",
  uniquenessKeys: () => ["hfa"],
  versionKey: (params, _pds) => `${params.versionId}`,
  pdsNotRequired: true,
});

export async function getDatasetHfaDisplayInfoFromCacheOrFetch(
  versionId: number,
) {
  const { data, version } = await _DATASET_HFA_DISPLAY_INFO_CACHE.get({
    versionId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDatasetHfaDisplayInfo({
    versionId,
  });

  _DATASET_HFA_DISPLAY_INFO_CACHE.setPromise(newPromise, { versionId }, version);

  return await newPromise;
}
