import {
  GenericLongFormFetchConfig,
  ItemsHolderPresentationObject,
  METRIC_TO_MODULE,
  PresentationObjectDetail,
  RESULTS_OBJECT_TO_MODULE,
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

export const _METRIC_INFO_CACHE = createReactiveCache<
  {
    projectId: string;
    metricId: string;
  },
  ResultsValueInfoForPresentationObject
>({
  name: "metric_info",
  uniquenessKeys: (params) => [
    params.projectId,
    params.metricId,
  ],
  versionKey: (params, pds) => pds.moduleLastRun[METRIC_TO_MODULE[params.metricId]] ?? "unknown",
});

export const _REPLICANT_OPTIONS_CACHE = createReactiveCache<
  {
    projectId: string;
    resultsObjectId: string;
    replicateBy: DisaggregationOption;
    fetchConfig: GenericLongFormFetchConfig;
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
  versionKey: (params, pds) => pds.moduleLastRun[RESULTS_OBJECT_TO_MODULE[params.resultsObjectId]] ?? "unknown",
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
    pds.moduleLastRun[RESULTS_OBJECT_TO_MODULE[params.resultsObjectId]] ?? "unknown",
});
