import {
  ReportConfig,
  ReportItemConfig,
  _SLIDE_BACKGROUND_COLOR,
  getColorDetailsForColorTheme,
} from "lib";
import { CustomPageStyleOptions, FontKeyOrFontInfo, getColor } from "panther";

/////////////////////////////////////////////////////////////////////////////////////////////////////////////
//  _______   _______             __             ______          ______    __                __            //
// /       \ /       \           /  |           /      \        /      \  /  |              /  |           //
// $$$$$$$  |$$$$$$$  |  ______  $$/   ______  /$$$$$$  |      /$$$$$$  |_$$ |_    __    __ $$ |  ______   //
// $$ |__$$ |$$ |__$$ | /      \ /  | /      \ $$ |_ $$/       $$ \__$$// $$   |  /  |  /  |$$ | /      \  //
// $$    $$/ $$    $$< /$$$$$$  |$$ |/$$$$$$  |$$   |          $$      \$$$$$$/   $$ |  $$ |$$ |/$$$$$$  | //
// $$$$$$$/  $$$$$$$  |$$ |  $$/ $$ |$$    $$ |$$$$/            $$$$$$  | $$ | __ $$ |  $$ |$$ |$$    $$ | //
// $$ |      $$ |__$$ |$$ |      $$ |$$$$$$$$/ $$ |            /  \__$$ | $$ |/  |$$ \__$$ |$$ |$$$$$$$$/  //
// $$ |      $$    $$/ $$ |      $$ |$$       |$$ |            $$    $$/  $$  $$/ $$    $$ |$$ |$$       | //
// $$/       $$$$$$$/  $$/       $$/  $$$$$$$/ $$/              $$$$$$/    $$$$/   $$$$$$$ |$$/  $$$$$$$/  //
//                                                                                /  \__$$ |               //
//                                                                                $$    $$/                //
//                                                                                 $$$$$$/                 //
//                                                                                                         //
/////////////////////////////////////////////////////////////////////////////////////////////////////////////

const _Inter_400: FontKeyOrFontInfo = {
  fontFamily: "Inter",
  weight: 400,
  italic: false,
};

const _Inter_800: FontKeyOrFontInfo = {
  fontFamily: "Inter",
  weight: 800,
  italic: false,
};

export function getStyle_PolicyBrief(
  reportConfig: ReportConfig,
  reportItemConfig?: ReportItemConfig,
) {
  const hasFooter =
    reportItemConfig?.freeform.useFooter &&
    reportItemConfig.freeform.footerText?.trim();

  const cDetails = getColorDetailsForColorTheme(reportConfig.colorTheme);

  const policyBriefStyle: CustomPageStyleOptions = {
    scale: 1.5,
    text: {
      //
      header: {
        font: _Inter_800,
        relFontSize: 8,
        color: cDetails.primaryTextColor,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      subHeader: {
        font: _Inter_800,
        relFontSize: 3,
        color: cDetails.primaryTextColor,
        // letterSpacing: "-0.02em",
      },
      date: {
        font: _Inter_400,
        relFontSize: 2,
        color: cDetails.primaryTextColor,
        // letterSpacing: "-0.02em",
      },
      footer: {
        font: _Inter_400,
        relFontSize: 2,
        color: cDetails.primaryTextColor,
        letterSpacing: "-0.02em",
      },
      //
      paragraph: {
        font: _Inter_400,
        color: cDetails.baseTextColor,
        relFontSize: 2.2,
        lineHeight: 1.4,
        lineBreakGap: 0.7,
      },
      pageNumber: {
        font: _Inter_400,
        color: hasFooter ? cDetails.primaryTextColor : cDetails.baseTextColor,
        relFontSize: 1.5,
      },
    },
    header: {
      backgroundColor: cDetails.primaryBackgroundColor,
      // logoHeight: cDetails.logoSize ?? 400,
      padding: [100, 120],
      logoGapX: 80,
      logoBottomPadding: 60,
      headerBottomPadding: 50,
      subHeaderBottomPadding: 20,
    },
    footer: {
      backgroundColor: cDetails.primaryBackgroundColor,
      logoGapX: 80,
      padding: [100, 120],
    },
    content: {
      padding: [100, 120],
      backgroundColor: cDetails.baseBackgroundColor,
      tabWidth: 10,
      gapX: 100,
      gapY: 80,
    },
  };
  return policyBriefStyle;
}
