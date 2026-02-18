import type { APIResponseWithData, ReportConfig } from "lib";
import type { PageInputs } from "panther";
import { getPageInputsFromReportItem } from "~/generate_report/mod";
import { serverActions } from "~/server_actions";
import {
  _REPORT_DETAIL_CACHE,
  _REPORT_ITEM_CACHE,
  _SLIDE_INPUTS_CACHE,
} from "./caches/reports";

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

export async function getPageInputsFromCacheOrFetch(
  projectId: string,
  reportId: string,
  reportItemId: string,
) {
  const { data, version } = await _SLIDE_INPUTS_CACHE.get({
    projectId,
    reportId,
    reportItemId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  const newPromise = getPageInputsCombo(
    projectId,
    reportId,
    reportItemId,
  );

  _SLIDE_INPUTS_CACHE.setPromise(
    newPromise,
    { projectId, reportId, reportItemId },
    version,
  );

  return await newPromise;
}

async function getPageInputsCombo(
  projectId: string,
  reportId: string,
  reportItemId: string,
): Promise<
  APIResponseWithData<{
    pageInputs: PageInputs;
  }>
> {
  const resReportDetail = await getReportDetailFromCacheOrFetch(
    projectId,
    reportId,
  );
  if (resReportDetail.success === false) {
    return resReportDetail;
  }
  const resReportItem = await getReportItemFromCacheOrFetch(
    projectId,
    reportId,
    reportItemId,
  );
  if (resReportItem.success === false) {
    return resReportItem;
  }
  const resPageInputs = await getPageInputsFromReportItem(
    projectId,
    resReportDetail.data.reportType,
    resReportDetail.data.config as ReportConfig,  // Report items only used with traditional reports
    resReportItem.data.config,
    resReportDetail.data.itemIdsInOrder.indexOf(resReportItem.data.id),
  );
  if (resPageInputs.success === false) {
    return resPageInputs;
  }

  return {
    success: true,
    data: {
      pageInputs: resPageInputs.data,
    },
  };
}

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

export async function getReportItemFromCacheOrFetch(
  projectId: string,
  reportId: string,
  reportItemId: string,
) {
  // Cache ALWAYS returns version, even on miss
  const { data, version } = await _REPORT_ITEM_CACHE.get({
    projectId,
    reportId,
    reportItemId,
  });

  if (data) {
    return { success: true, data } as const;
  }

  // Cache miss - fetch from server
  const newPromise = serverActions.getReportItem({
    projectId,
    report_id: reportId,
    item_id: reportItemId,
  });

  // Use the version from get() to ensure consistency
  _REPORT_ITEM_CACHE.setPromise(
    newPromise,
    { projectId, reportId, reportItemId },
    version,
  );

  return await newPromise;
}

////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______                                             __                  __              __                __  __  //
// /       \                                           /  |                /  |            /  |              /  |/  | //
// $$$$$$$  |  ______    ______    ______    ______   _$$ |_           ____$$ |  ______   _$$ |_     ______  $$/ $$ | //
// $$ |__$$ | /      \  /      \  /      \  /      \ / $$   |         /    $$ | /      \ / $$   |   /      \ /  |$$ | //
// $$    $$< /$$$$$$  |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$$$$$/         /$$$$$$$ |/$$$$$$  |$$$$$$/    $$$$$$  |$$ |$$ | //
// $$$$$$$  |$$    $$ |$$ |  $$ |$$ |  $$ |$$ |  $$/   $$ | __       $$ |  $$ |$$    $$ |  $$ | __  /    $$ |$$ |$$ | //
// $$ |  $$ |$$$$$$$$/ $$ |__$$ |$$ \__$$ |$$ |        $$ |/  |      $$ \__$$ |$$$$$$$$/   $$ |/  |/$$$$$$$ |$$ |$$ | //
// $$ |  $$ |$$       |$$    $$/ $$    $$/ $$ |        $$  $$/       $$    $$ |$$       |  $$  $$/ $$    $$ |$$ |$$ | //
// $$/   $$/  $$$$$$$/ $$$$$$$/   $$$$$$/  $$/          $$$$/         $$$$$$$/  $$$$$$$/    $$$$/   $$$$$$$/ $$/ $$/  //
//                     $$ |                                                                                           //
//                     $$ |                                                                                           //
//                     $$/                                                                                            //
//                                                                                                                    //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// NEW REACTIVE CACHE - Cache manages PDS internally, returns version
export async function getReportDetailFromCacheOrFetch(
  projectId: string,
  reportId: string,
) {
  // Cache ALWAYS returns version, even on miss
  const { data, version } = await _REPORT_DETAIL_CACHE.get({
    projectId,
    reportId,
  });

  if (data) {
    // Wrap cached data in APIResponse format to match server response
    return { success: true, data } as const;
  }

  // Cache miss - fetch from server
  const newPromise = serverActions.getReportDetail({
    projectId,
    report_id: reportId,
  });

  // Use the version from get() to ensure consistency
  _REPORT_DETAIL_CACHE.setPromise(newPromise, { projectId, reportId }, version);

  return await newPromise;
}
