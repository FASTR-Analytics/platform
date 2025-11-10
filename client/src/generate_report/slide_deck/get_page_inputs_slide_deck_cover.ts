import { APIResponseWithData, ReportConfig, ReportItemConfig } from "lib";
import { PageInputs } from "panther";
import { _SERVER_HOST } from "~/server_actions/config";
import { getImgFromCacheOrFetch } from "~/state/img_cache";
import { getOverlayImage } from "../get_overlay_image";
import { getStyle_SlideDeck } from "./get_style_slide_deck";

////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______   _______                       __               ______                                           //
//  /      \ /       \                     /  |             /      \                                          //
// /$$$$$$  |$$$$$$$  |  ______    _______ $$ |   __       /$$$$$$  |  ______   __     __  ______    ______   //
// $$ \__$$/ $$ |  $$ | /      \  /       |$$ |  /  |      $$ |  $$/  /      \ /  \   /  |/      \  /      \  //
// $$      \ $$ |  $$ |/$$$$$$  |/$$$$$$$/ $$ |_/$$/       $$ |      /$$$$$$  |$$  \ /$$//$$$$$$  |/$$$$$$  | //
//  $$$$$$  |$$ |  $$ |$$    $$ |$$ |      $$   $$<        $$ |   __ $$ |  $$ | $$  /$$/ $$    $$ |$$ |  $$/  //
// /  \__$$ |$$ |__$$ |$$$$$$$$/ $$ \_____ $$$$$$  \       $$ \__/  |$$ \__$$ |  $$ $$/  $$$$$$$$/ $$ |       //
// $$    $$/ $$    $$/ $$       |$$       |$$ | $$  |      $$    $$/ $$    $$/    $$$/   $$       |$$ |       //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/ $$/   $$/        $$$$$$/   $$$$$$/      $/     $$$$$$$/ $$/        //
//                                                                                                            //
////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function getPageInputs_SlideDeck_Cover(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
): Promise<APIResponseWithData<PageInputs>> {
  try {
    const titleLogos: HTMLImageElement[] = [];
    for (const logo of reportConfig.logos ?? []) {
      if (!!reportItemConfig.cover.logos?.includes(logo)) {
        const resImg = await getImgFromCacheOrFetch(`${_SERVER_HOST}/${logo}`);
        if (resImg.success === true) {
          titleLogos.push(resImg.data);
        }
      }
    }

    const overlay = await getOverlayImage(reportConfig);

    return {
      success: true,
      data: {
        type: "cover",
        title: reportItemConfig.cover.titleText,
        subTitle: reportItemConfig.cover.subTitleText,
        author: reportItemConfig.cover.presenterText,
        date: reportItemConfig.cover.dateText,
        watermark:
          reportConfig.useWatermark && reportConfig.watermarkText?.trim()
            ? reportConfig.watermarkText.trim()
            : undefined,
        titleLogos,
        overlay,
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
