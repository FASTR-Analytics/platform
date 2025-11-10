import {
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  PresentationObjectDetail,
  ReplicantOptionsForPresentationObject,
  ResultsValueInfoForPresentationObject,
  hashFetchConfig,
  type DisaggregationOption,
} from "lib";
import { createReactiveCache } from "./reactive_cache";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______    ______         __     __                     __            __        __                  __             ______           //
// /       \  /      \       /  |   /  |                   /  |          /  |      /  |                /  |           /      \          //
// $$$$$$$  |/$$$$$$  |      $$ |   $$ | ______    ______  $$/   ______  $$ |____  $$ |  ______        $$/  _______  /$$$$$$  |______   //
// $$ |__$$ |$$ |  $$ |      $$ |   $$ |/      \  /      \ /  | /      \ $$      \ $$ | /      \       /  |/       \ $$ |_ $$//      \  //
// $$    $$< $$ |  $$ |      $$  \ /$$/ $$$$$$  |/$$$$$$  |$$ | $$$$$$  |$$$$$$$  |$$ |/$$$$$$  |      $$ |$$$$$$$  |$$   |  /$$$$$$  | //
// $$$$$$$  |$$ |  $$ |       $$  /$$/  /    $$ |$$ |  $$/ $$ | /    $$ |$$ |  $$ |$$ |$$    $$ |      $$ |$$ |  $$ |$$$$/   $$ |  $$ | //
// $$ |  $$ |$$ \__$$ |        $$ $$/  /$$$$$$$ |$$ |      $$ |/$$$$$$$ |$$ |__$$ |$$ |$$$$$$$$/       $$ |$$ |  $$ |$$ |    $$ \__$$ | //
// $$ |  $$ |$$    $$/          $$$/   $$    $$ |$$ |      $$ |$$    $$ |$$    $$/ $$ |$$       |      $$ |$$ |  $$ |$$ |    $$    $$/  //
// $$/   $$/  $$$$$$/            $/     $$$$$$$/ $$/       $$/  $$$$$$$/ $$$$$$$/  $$/  $$$$$$$/       $$/ $$/   $$/ $$/      $$$$$$/   //
//                                                                                                                                      //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const _RESULTS_VALUE_INFO_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsValueId: string;
    moduleId: string;
  },
  ResultsValueInfoForPresentationObject
>({
  name: "results_value_info",
  uniquenessKeys: (params) => [
    params.projectId,
    params.resultsValueId,
  ],
  versionKey: (params, pds) => pds.moduleLastRun[params.moduleId] ?? "unknown",
});

export const _REPLICANT_OPTIONS_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
    moduleId: string;
  },
  ReplicantOptionsForPresentationObject
>({
  name: "replicant_options",
  uniquenessKeys: (params) => [
    params.projectId,
    params.resultsObjectId,
    params.replicateBy,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: (params, pds) => pds.moduleLastRun[params.moduleId] ?? "unknown",
});

////////////////////////////////////////////////////////////////////////////////
//  _______    ______         _______               __                __  __  //
// /       \  /      \       /       \             /  |              /  |/  | //
// $$$$$$$  |/$$$$$$  |      $$$$$$$  |  ______   _$$ |_     ______  $$/ $$ | //
// $$ |__$$ |$$ |  $$ |      $$ |  $$ | /      \ / $$   |   /      \ /  |$$ | //
// $$    $$/ $$ |  $$ |      $$ |  $$ |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$ | //
// $$$$$$$/  $$ |  $$ |      $$ |  $$ |$$    $$ |  $$ | __  /    $$ |$$ |$$ | //
// $$ |      $$ \__$$ |      $$ |__$$ |$$$$$$$$/   $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$ |      $$    $$/       $$    $$/ $$       |  $$  $$/ $$    $$ |$$ |$$ | //
// $$/        $$$$$$/        $$$$$$$/   $$$$$$$/    $$$$/   $$$$$$$/ $$/ $$/  //
//                                                                            //
////////////////////////////////////////////////////////////////////////////////

export const _PO_DETAIL_CACHE = createReactiveCache<
  {
    projectId: string;
    presentationObjectId: string;
  },
  PresentationObjectDetail
>({
  name: "po_detail",
  uniquenessKeys: (params) => [params.projectId, params.presentationObjectId],
  versionKey: (params, pds) =>
    pds.lastUpdated.presentation_objects[params.presentationObjectId] ?? "unknown",
});

//////////////////////////////////////////////////////////////////////////////////
//  _______    ______         ______  __                                        //
// /       \  /      \       /      |/  |                                       //
// $$$$$$$  |/$$$$$$  |      $$$$$$/_$$ |_     ______   _____  ____    _______  //
// $$ |__$$ |$$ |  $$ |        $$ |/ $$   |   /      \ /     \/    \  /       | //
// $$    $$/ $$ |  $$ |        $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  |/$$$$$$$/  //
// $$$$$$$/  $$ |  $$ |        $$ |  $$ | __ $$    $$ |$$ | $$ | $$ |$$      \  //
// $$ |      $$ \__$$ |       _$$ |_ $$ |/  |$$$$$$$$/ $$ | $$ | $$ | $$$$$$  | //
// $$ |      $$    $$/       / $$   |$$  $$/ $$       |$$ | $$ | $$ |/     $$/  //
// $$/        $$$$$$/        $$$$$$/  $$$$/   $$$$$$$/ $$/  $$/  $$/ $$$$$$$/   //
//                                                                              //
//////////////////////////////////////////////////////////////////////////////////

export const _PO_ITEMS_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsObjectId: string;
    fetchConfig: GenericLongFormFetchConfig;
    moduleId: string;
  },
  ItemsHolderPresentationObject
>({
  name: "po_items",
  uniquenessKeys: (params) => [
    params.projectId,
    params.resultsObjectId,
    hashFetchConfig(params.fetchConfig),
  ],
  versionKey: (params, pds) =>
    pds.moduleLastRun[params.moduleId] ?? "unknown",
});
