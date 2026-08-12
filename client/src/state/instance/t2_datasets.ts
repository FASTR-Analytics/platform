import {
  APIResponseWithData,
  hashStructureSchema,
  ItemsHolderDatasetHmisDisplay,
  type HfaDictionaryForValidation,
  type IcehDisplayData,
  type IndicatorType,
  type StructureSchema,
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
    structureSchema: StructureSchema;
    versionId: number;
    indicatorMappingsVersion: string;
    structureLastUpdated: string | undefined;
  },
  ItemsHolderDatasetHmisDisplay
>({
  name: "dataset_hmis_display_info",
  // Include-flags hash only — labels are display-only and must not bust a
  // data cache
  uniquenessKeys: (params) => {
    const schemaHash = hashStructureSchema(params.structureSchema);
    return [params.rawOrCommonIndicators, schemaHash];
  },
  // structureLastUpdated closes the hole where a facility re-import changes
  // the admin tree without any other key moving; the undefined case (no
  // structure yet) is guarded with an explicit token
  versionKey: (params, _pds) =>
    `${params.versionId}_${params.indicatorMappingsVersion}_${
      params.structureLastUpdated ?? "no-structure"
    }`,
  pdsNotRequired: true,
});

export async function getDatasetHmisDisplayInfoFromCacheOrFetch(
  rawOrCommonIndicators: IndicatorType,
  versionId: number,
  indicatorMappingsVersion: string,
  structureSchema: StructureSchema,
  structureLastUpdated: string | undefined,
  hmisImportRunActive: boolean,
) {
  // While a run is integrating per-pair, the data keeps changing under the
  // settled version token — neither read nor store the IndexedDB cache
  // (mirrors the server's Valkey bypass; the token flips at run end).
  if (hmisImportRunActive) {
    return await serverActions.getDatasetHmisDisplayInfo({
      rawOrCommonIndicators,
      versionId,
      indicatorMappingsVersion,
      structureSchema,
    });
  }

  const { data, version } = await _DATASET_HMIS_DISPLAY_INFO_CACHE.get({
    rawOrCommonIndicators,
    structureSchema,
    versionId,
    indicatorMappingsVersion,
    structureLastUpdated,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDatasetHmisDisplayInfo({
    rawOrCommonIndicators,
    versionId,
    indicatorMappingsVersion,
    structureSchema,
  });

  _DATASET_HMIS_DISPLAY_INFO_CACHE.setPromise(
    newPromise,
    {
      rawOrCommonIndicators,
      structureSchema,
      versionId,
      indicatorMappingsVersion,
      structureLastUpdated,
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

// ============================================================================
// ICEH Display
// ============================================================================

const _DATASET_ICEH_DISPLAY_INFO_CACHE = createReactiveCache<
  { cacheHash: string },
  IcehDisplayData
>({
  name: "dataset_iceh_display_info",
  uniquenessKeys: () => ["iceh"],
  versionKey: (params) => params.cacheHash,
  pdsNotRequired: true,
});

export async function getDatasetIcehDisplayInfoFromCacheOrFetch(
  cacheHash: string,
) {
  const { data, version } = await _DATASET_ICEH_DISPLAY_INFO_CACHE.get({ cacheHash });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getDatasetIcehDisplayData({});

  _DATASET_ICEH_DISPLAY_INFO_CACHE.setPromise(newPromise, { cacheHash }, version);

  return await newPromise;
}

// ============================================================================
// HFA Dictionary (for indicator code validation)
// ============================================================================

const _HFA_DICTIONARY_CACHE = createReactiveCache<
  { hfaCacheHash: string },
  HfaDictionaryForValidation
>({
  name: "hfa_dictionary",
  uniquenessKeys: () => ["hfa_dictionary"],
  versionKey: (params) => params.hfaCacheHash,
  pdsNotRequired: true,
});

export async function getHfaDictionaryFromCacheOrFetch(hfaCacheHash: string) {
  const { data, version } = await _HFA_DICTIONARY_CACHE.get({ hfaCacheHash });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = serverActions.getHfaDictionaryForValidation({});

  _HFA_DICTIONARY_CACHE.setPromise(newPromise, { hfaCacheHash }, version);

  return await newPromise;
}
