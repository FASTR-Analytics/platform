import {
  ReportConfig,
  ReportItemConfig,
  ReportType,
} from "lib";
import { APIResponseWithData, PageInputs } from "panther";
import { getPageInputs_PolicyBrief_Freeform } from "./policy_brief/get_page_inputs_policy_brief_freeform";
import { getPageInputs_SlideDeck_Cover } from "./slide_deck/get_page_inputs_slide_deck_cover";
import { getPageInputs_SlideDeck_Freeform } from "./slide_deck/get_page_inputs_slide_deck_freeform";
import { getPageInputs_SlideDeck_Section } from "./slide_deck/get_page_inputs_slide_deck_section";

export async function getPageInputsFromReportItem(
  projectId: string,
  reportType: ReportType,
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
  itemIndex: number | undefined,
  pdfScaleFactor?: number,
): Promise<APIResponseWithData<PageInputs>> {
  if (reportType === "slide_deck") {
    if (reportItemConfig.type === "freeform") {
      return await getPageInputs_SlideDeck_Freeform(
        projectId,
        reportConfig,
        reportItemConfig,
        itemIndex,
        pdfScaleFactor,
      );
    }
    if (reportItemConfig.type === "cover") {
      return await getPageInputs_SlideDeck_Cover(
        projectId,
        reportConfig,
        reportItemConfig,
      );
    }
    if (reportItemConfig.type === "section") {
      return await getPageInputs_SlideDeck_Section(
        projectId,
        reportConfig,
        reportItemConfig,
        itemIndex,
      );
    }
    // if (reportItemConfig.type === "end_slide") {
    //   return getPageInputs_SlideDeck_EndSlide(
    //     projectId,
    //     reportConfig,
    //     reportItemConfig,
    //     itemIndex,
    //   );
    // }
  }
  if (reportType === "policy_brief") {
    return await getPageInputs_PolicyBrief_Freeform(
      projectId,
      reportConfig,
      reportItemConfig,
      itemIndex,
      pdfScaleFactor,
    );
  }
  throw new Error(`Bad slide input type: reportType=${reportType}, itemType=${reportItemConfig.type}`);
}
