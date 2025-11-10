import { ReportDetail, ReportItem } from "lib";
import { PageInputs } from "panther";
import { createReactiveCache } from "./reactive_cache";

///////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______   __  __        __                  __                                  __               //
//  /      \ /  |/  |      /  |                /  |                                /  |              //
// /$$$$$$  |$$ |$$/   ____$$ |  ______        $$/  _______    ______   __    __  _$$ |_    _______  //
// $$ \__$$/ $$ |/  | /    $$ | /      \       /  |/       \  /      \ /  |  /  |/ $$   |  /       | //
// $$      \ $$ |$$ |/$$$$$$$ |/$$$$$$  |      $$ |$$$$$$$  |/$$$$$$  |$$ |  $$ |$$$$$$/  /$$$$$$$/  //
//  $$$$$$  |$$ |$$ |$$ |  $$ |$$    $$ |      $$ |$$ |  $$ |$$ |  $$ |$$ |  $$ |  $$ | __$$      \  //
// /  \__$$ |$$ |$$ |$$ \__$$ |$$$$$$$$/       $$ |$$ |  $$ |$$ |__$$ |$$ \__$$ |  $$ |/  |$$$$$$  | //
// $$    $$/ $$ |$$ |$$    $$ |$$       |      $$ |$$ |  $$ |$$    $$/ $$    $$/   $$  $$//     $$/  //
//  $$$$$$/  $$/ $$/  $$$$$$$/  $$$$$$$/       $$/ $$/   $$/ $$$$$$$/   $$$$$$/     $$$$/ $$$$$$$/   //
//                                                           $$ |                                    //
//                                                           $$ |                                    //
//                                                           $$/                                     //
//                                                                                                   //
///////////////////////////////////////////////////////////////////////////////////////////////////////

export const _SLIDE_INPUTS_CACHE = createReactiveCache<
  {
    projectId: string;
    reportId: string;
    reportItemId: string;
    pdfScaleFactor: number | undefined;
  },
  {
    pageInputs: PageInputs;
  }
>({
  name: "slide_inputs",
  uniquenessKeys: (params) => [
    params.projectId,
    params.reportId,
    params.reportItemId,
  ],
  versionKey: (params, pds) => {
    const reportLastUpdated = pds.lastUpdated.reports[params.reportId] ?? "unknown";
    const reportItemLastUpdated = pds.lastUpdated.report_items[params.reportItemId] ?? "unknown";
    return [
      pds.anyModuleLastRun,
      reportLastUpdated,
      reportItemLastUpdated,
      String(params.pdfScaleFactor),
    ].join("|");
  },
});

//////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______                                             __            __    __                              //
// /       \                                           /  |          /  |  /  |                             //
// $$$$$$$  |  ______    ______    ______    ______   _$$ |_         $$/  _$$ |_     ______   _____  ____   //
// $$ |__$$ | /      \  /      \  /      \  /      \ / $$   |        /  |/ $$   |   /      \ /     \/    \  //
// $$    $$< /$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$/         $$ |$$$$$$/   /$$$$$$  |$$$$$$ $$$$  | //
// $$$$$$$  |$$    $$ |$$ |  $$ |$$ |  $$ |$$ |  $$/   $$ | __       $$ |  $$ | __ $$    $$ |$$ | $$ | $$ | //
// $$ |  $$ |$$$$$$$$/ $$ |__$$ |$$ \__$$ |$$ |        $$ |/  |      $$ |  $$ |/  |$$$$$$$$/ $$ | $$ | $$ | //
// $$ |  $$ |$$       |$$    $$/ $$    $$/ $$ |        $$  $$/       $$ |  $$  $$/ $$       |$$ | $$ | $$ | //
// $$/   $$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/          $$$$/        $$/    $$$$/   $$$$$$$/ $$/  $$/  $$/  //
//                     $$ |                                                                                 //
//                     $$ |                                                                                 //
//                     $$/                                                                                  //
//                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////

export const _REPORT_ITEM_CACHE = createReactiveCache<
  {
    projectId: string;
    reportId: string;
    reportItemId: string;
  },
  ReportItem
>({
  name: "report_item",
  uniquenessKeys: (params) => [params.projectId, params.reportId, params.reportItemId],
  versionKey: (params, pds) =>
    pds.lastUpdated.report_items[params.reportItemId] ?? "unknown",
});

// Report Detail Cache - NEW REACTIVE SYSTEM (Proof-of-Concept)
export const _REPORT_DETAIL_CACHE = createReactiveCache<
  {
    projectId: string;
    reportId: string;
  },
  ReportDetail
>({
  name: "report_detail",
  uniquenessKeys: (params) => [params.projectId, params.reportId],
  versionKey: (params, pds) =>
    pds.lastUpdated.reports[params.reportId] ?? "unknown",
});
