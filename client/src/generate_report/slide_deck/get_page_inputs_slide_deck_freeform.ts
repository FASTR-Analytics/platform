import {
  APIResponseWithData,
  ReportConfig,
  ReportItemConfig,
  withReplicantForReport,
} from "lib";
import { PageInputs, _GLOBAL_CANVAS_PIXEL_WIDTH } from "panther";
import { getRowsForFreeform } from "../get_rows_for_freeform";
import { getStyle_SlideDeck } from "./get_style_slide_deck";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______   _______                       __              ________                              ______                                   //
//  /      \ /       \                     /  |            /        |                            /      \                                  //
// /$$$$$$  |$$$$$$$  |  ______    _______ $$ |   __       $$$$$$$$/______    ______    ______  /$$$$$$  |______    ______   _____  ____   //
// $$ \__$$/ $$ |  $$ | /      \  /       |$$ |  /  |      $$ |__  /      \  /      \  /      \ $$ |_ $$//      \  /      \ /     \/    \  //
// $$      \ $$ |  $$ |/$$$$$$  |/$$$$$$$/ $$ |_/$$/       $$    |/$$$$$$  |/$$$$$$  |/$$$$$$  |$$   |  /$$$$$$  |/$$$$$$  |$$$$$$ $$$$  | //
//  $$$$$$  |$$ |  $$ |$$    $$ |$$ |      $$   $$<        $$$$$/ $$ |  $$/ $$    $$ |$$    $$ |$$$$/   $$ |  $$ |$$ |  $$/ $$ | $$ | $$ | //
// /  \__$$ |$$ |__$$ |$$$$$$$$/ $$ \_____ $$$$$$  \       $$ |   $$ |      $$$$$$$$/ $$$$$$$$/ $$ |    $$ \__$$ |$$ |      $$ | $$ | $$ | //
// $$    $$/ $$    $$/ $$       |$$       |$$ | $$  |      $$ |   $$ |      $$       |$$       |$$ |    $$    $$/ $$ |      $$ | $$ | $$ | //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/ $$/   $$/       $$/    $$/        $$$$$$$/  $$$$$$$/ $$/      $$$$$$/  $$/       $$/  $$/  $$/  //
//                                                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function getPageInputs_SlideDeck_Freeform(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  itemIndex: number | undefined,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<PageInputs>> {
  try {
    const resRows = await getRowsForFreeform(
      projectId,
      reportConfig,
      reportItemConfig,
      pdfScaleFactor,
    );

    if (resRows.success === false) {
      return resRows;
    }

    const headerLogos: HTMLImageElement[] = [];
    if (reportItemConfig.freeform.useHeader) {
      for (const logo of reportConfig.logos ?? []) {
        if (!!reportItemConfig.freeform.headerLogos?.includes(logo)) {
          const resImg = await getImgFromCacheOrFetch(
            `${_SERVER_HOST}/${logo}`,
          );
          if (resImg.success === true) {
            headerLogos.push(resImg.data);
          }
        }
      }
    }

    const footerLogos: HTMLImageElement[] = [];
    if (reportItemConfig.freeform.useFooter) {
      for (const logo of reportConfig.logos ?? []) {
        if (!!reportItemConfig.freeform.footerLogos?.includes(logo)) {
          const resImg = await getImgFromCacheOrFetch(
            `${_SERVER_HOST}/${logo}`,
          );
          if (resImg.success === true) {
            footerLogos.push(resImg.data);
          }
        }
      }
    }

    return {
      success: true,
      data: {
        type: "freeform",
        header:
          reportItemConfig.freeform.useHeader &&
          reportItemConfig.freeform.headerText?.trim()
            ? withReplicantForReport(
                reportItemConfig.freeform.headerText!.trim(),
                reportConfig,
              )
            : undefined,
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
        content: resRows.data,
        pageNumber:
          reportConfig.showPageNumbers && itemIndex !== undefined
            ? String(itemIndex + 1)
            : undefined,
        style: getStyle_SlideDeck(reportConfig, reportItemConfig),
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
