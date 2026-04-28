import { APIResponseWithData, ReportConfig, ReportItemConfig } from "lib";
import { PageInputs } from "panther";
import { getOverlayImage } from "../get_overlay_image";
import { getStyle_SlideDeck } from "./get_style_slide_deck";

//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______   _______                       __               ______                         __      __                      //
//  /      \ /       \                     /  |             /      \                       /  |    /  |                     //
// /$$$$$$  |$$$$$$$  |  ______    _______ $$ |   __       /$$$$$$  |  ______    _______  _$$ |_   $$/   ______   _______   //
// $$ \__$$/ $$ |  $$ | /      \  /       |$$ |  /  |      $$ \__$$/  /      \  /       |/ $$   |  /  | /      \ /       \  //
// $$      \ $$ |  $$ |/$$$$$$  |/$$$$$$$/ $$ |_/$$/       $$      \ /$$$$$$  |/$$$$$$$/ $$$$$$/   $$ |/$$$$$$  |$$$$$$$  | //
//  $$$$$$  |$$ |  $$ |$$    $$ |$$ |      $$   $$<         $$$$$$  |$$    $$ |$$ |        $$ | __ $$ |$$ |  $$ |$$ |  $$ | //
// /  \__$$ |$$ |__$$ |$$$$$$$$/ $$ \_____ $$$$$$  \       /  \__$$ |$$$$$$$$/ $$ \_____   $$ |/  |$$ |$$ \__$$ |$$ |  $$ | //
// $$    $$/ $$    $$/ $$       |$$       |$$ | $$  |      $$    $$/ $$       |$$       |  $$  $$/ $$ |$$    $$/ $$ |  $$ | //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/ $$/   $$/        $$$$$$/   $$$$$$$/  $$$$$$$/    $$$$/  $$/  $$$$$$/  $$/   $$/  //
//                                                                                                                          //
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

export async function getPageInputs_SlideDeck_Section(
  projectId: string,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  itemIndex: number | undefined,
): Promise<APIResponseWithData<PageInputs>> {
  try {
    const overlay = await getOverlayImage(reportConfig);

    return {
      success: true,
      data: {
        type: "section",
        sectionTitle: reportItemConfig.section.sectionText,
        sectionSubTitle: reportItemConfig.section.smallerSectionText,
        watermark:
          reportConfig.useWatermark && reportConfig.watermarkText?.trim()
            ? reportConfig.watermarkText.trim()
            : undefined,
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
