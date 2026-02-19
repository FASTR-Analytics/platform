import { ReportConfig, ReportItemConfig } from "lib";
import {
  APIResponseWithData,
  PageInputs,
  _GLOBAL_CANVAS_PIXEL_WIDTH,
} from "panther";
import { withReplicantForReport } from "lib";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getRowsForFreeform } from "../get_rows_for_freeform";
import { getStyle_PolicyBrief } from "./get_style_policy_brief";
import { getOverlayImage } from "../get_overlay_image";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______   _______             __             ______         ________                              ______                                   //
// /       \ /       \           /  |           /      \       /        |                            /      \                                  //
// $$$$$$$  |$$$$$$$  |  ______  $$/   ______  /$$$$$$  |      $$$$$$$$/______    ______    ______  /$$$$$$  |______    ______   _____  ____   //
// $$ |__$$ |$$ |__$$ | /      \ /  | /      \ $$ |_ $$/       $$ |__  /      \  /      \  /      \ $$ |_ $$//      \  /      \ /     \/    \  //
// $$    $$/ $$    $$< /$$$$$$  |$$ |/$$$$$$  |$$   |          $$    |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$   |  /$$$$$$  |/$$$$$$  |$$$$$$ $$$$  | //
// $$$$$$$/  $$$$$$$  |$$ |  $$/ $$ |$$    $$ |$$$$/           $$$$$/ $$ |  $$/ $$    $$ |$$    $$ |$$$$/   $$ |  $$ |$$ |  $$/ $$ | $$ | $$ | //
// $$ |      $$ |__$$ |$$ |      $$ |$$$$$$$$/ $$ |            $$ |   $$ |      $$$$$$$$/ $$$$$$$$/ $$ |    $$ \__$$ |$$ |      $$ | $$ | $$ | //
// $$ |      $$    $$/ $$ |      $$ |$$       |$$ |            $$ |   $$ |      $$       |$$       |$$ |    $$    $$/ $$ |      $$ | $$ | $$ | //
// $$/       $$$$$$$/  $$/       $$/  $$$$$$$/ $$/             $$/    $$/        $$$$$$$/  $$$$$$$/ $$/      $$$$$$/  $$/       $$/  $$/  $$/  //
//                                                                                                                                             //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function getPageInputs_PolicyBrief_Freeform(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  itemIndex: number | undefined,
): Promise<APIResponseWithData<PageInputs>> {
  try {
    const resRows = await getRowsForFreeform(
      projectId,
      reportConfig,
      reportItemConfig,
    );

    if (resRows.success === false) {
      return resRows;
    }

    const headerLogos: HTMLImageElement[] = [];
    for (const logo of reportConfig.logos ?? []) {
      if (!!reportItemConfig.freeform.headerLogos?.includes(logo)) {
        const resImg = await getImgFromCacheOrFetch(`${_SERVER_HOST}/${logo}`);
        if (resImg.success === true) {
          headerLogos.push(resImg.data);
        }
      }
    }

    const footerLogos: HTMLImageElement[] = [];
    for (const logo of reportConfig.logos ?? []) {
      if (!!reportItemConfig.freeform.footerLogos?.includes(logo)) {
        const resImg = await getImgFromCacheOrFetch(`${_SERVER_HOST}/${logo}`);
        if (resImg.success === true) {
          footerLogos.push(resImg.data);
        }
      }
    }

    const overlay = await getOverlayImage(reportConfig);

    return {
      success: true,
      data: {
        type: "freeform",
        //
        header:
          reportItemConfig.freeform.useHeader &&
          reportItemConfig.freeform.headerText?.trim()
            ? withReplicantForReport(
                reportItemConfig.freeform.headerText!.trim(),
                reportConfig,
              )
            : undefined,
        subHeader: reportItemConfig.freeform.useHeader
          ? (reportItemConfig.freeform.subHeaderText?.trim() ?? undefined)
          : undefined,
        date: reportItemConfig.freeform.useHeader
          ? (reportItemConfig.freeform.dateText?.trim() ?? undefined)
          : undefined,
        //
        footer:
          reportItemConfig.freeform.useFooter &&
          reportItemConfig.freeform.footerText?.trim()
            ? withReplicantForReport(
                reportItemConfig.freeform.footerText!.trim(),
                reportConfig,
              )
            : undefined,
        watermark:
          reportConfig.useWatermark && reportConfig.watermarkText?.trim()
            ? reportConfig.watermarkText!.trim()
            : undefined,
        headerLogos,
        footerLogos,
        overlay,
        content: resRows.data,
        pageNumber:
          reportConfig.showPageNumbers && itemIndex !== undefined
            ? String(itemIndex + 1)
            : undefined,
        style: getStyle_PolicyBrief(reportConfig, reportItemConfig),
      },
    };
  } catch (e) {
    return {
      success: false,
      err:
        "Problem getting slide imputs from report item: " +
        (e instanceof Error ? e.message : ""),
    };
  }
}
