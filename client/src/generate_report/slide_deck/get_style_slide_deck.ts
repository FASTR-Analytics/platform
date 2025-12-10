import {
  ReportConfig,
  ReportItemConfig,
  _SLIDE_BACKGROUND_COLOR,
  getColorDetailsForColorTheme,
} from "lib";
import { CustomPageStyleOptions, FontInfo, getColor } from "panther";

/////////////////////////////////////////////////////////////////////////////////////////////////////////
//   ______   _______                       __               ______    __                __            //
//  /      \ /       \                     /  |             /      \  /  |              /  |           //
// /$$$$$$  |$$$$$$$  |  ______    _______ $$ |   __       /$$$$$$  |_$$ |_    __    __ $$ |  ______   //
// $$ \__$$/ $$ |  $$ | /      \  /       |$$ |  /  |      $$ \__$$// $$   |  /  |  /  |$$ | /      \  //
// $$      \ $$ |  $$ |/$$$$$$  |/$$$$$$$/ $$ |_/$$/       $$      \$$$$$$/   $$ |  $$ |$$ |/$$$$$$  | //
//  $$$$$$  |$$ |  $$ |$$    $$ |$$ |      $$   $$<         $$$$$$  | $$ | __ $$ |  $$ |$$ |$$    $$ | //
// /  \__$$ |$$ |__$$ |$$$$$$$$/ $$ \_____ $$$$$$  \       /  \__$$ | $$ |/  |$$ \__$$ |$$ |$$$$$$$$/  //
// $$    $$/ $$    $$/ $$       |$$       |$$ | $$  |      $$    $$/  $$  $$/ $$    $$ |$$ |$$       | //
//  $$$$$$/  $$$$$$$/   $$$$$$$/  $$$$$$$/ $$/   $$/        $$$$$$/    $$$$/   $$$$$$$ |$$/  $$$$$$$/  //
//                                                                            /  \__$$ |               //
//                                                                            $$    $$/                //
//                                                                             $$$$$$/                 //
//                                                                                                     //
/////////////////////////////////////////////////////////////////////////////////////////////////////////

const _Inter_400: FontInfo = {
  fontFamily: "Inter",
  weight: 400,
  italic: false,
};

const _Inter_800: FontInfo = {
  fontFamily: "Inter",
  weight: 800,
  italic: false,
};

export function getStyle_SlideDeck(
  reportConfig: ReportConfig,
  reportItemConfig: ReportItemConfig,
) {
  const hasFooter =
    reportItemConfig.freeform.useFooter &&
    reportItemConfig.freeform.footerText?.trim();

  const cDetails = getColorDetailsForColorTheme(reportConfig.colorTheme);

  const slideDeckStyle: CustomPageStyleOptions = {
    text: {
      coverTitle: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: reportItemConfig.cover.titleTextRelFontSize ?? 10,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      coverSubTitle: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize: reportItemConfig.cover.subTitleTextRelFontSize ?? 6,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      coverAuthor: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: reportItemConfig.cover.presenterTextRelFontSize ?? 4,
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
      },
      coverDate: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize: reportItemConfig.cover.dateTextRelFontSize ?? 3,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      //
      sectionTitle: {
        font: _Inter_800,
        color: cDetails.primaryTextColor,
        relFontSize: reportItemConfig.section.sectionTextRelFontSize ?? 8,
        letterSpacing: "-0.02em",
        lineHeight: 1.05,
      },
      sectionSubTitle: {
        font: _Inter_400,
        color: cDetails.primaryTextColor,
        relFontSize:
          reportItemConfig.section.smallerSectionTextRelFontSize ?? 5,
        letterSpacing: "-0.02em",
        lineHeight: 1.1,
      },
      //
      header: {
        font: _Inter_800,
        relFontSize: 5.5,
        color: cDetails.baseTextColor,
        letterSpacing: "-0.02em",
        lineHeight: 1,
      },
      footer: {
        font: _Inter_400,
        relFontSize: 2,
        color: cDetails.primaryTextColor,
        letterSpacing: "-0.02em",
      },
      //
      // paragraph: {
      //   font: _Inter_400,
      //   color: cDetails.baseTextColor,
      //   relFontSize: 2.3,
      //   lineHeight: 1.4,
      //   lineBreakGap: 0.7,
      // },
      pageNumber: {
        font: _Inter_400,
        color: hasFooter ? cDetails.primaryTextColor : cDetails.baseTextColor,
        relFontSize: 1.5,
      },
    },
    cover: {
      backgroundColor: cDetails.primaryBackgroundColor,
      logoGapX: 80,
      gapY: 60,
      // logoWidth: cDetails.logoSize,
    },
    header: {
      backgroundColor: cDetails.baseBackgroundColor,
      // logoWidth: cDetails.logoSize ?? 400,
      padding: [60, 80, 0, 80],
    },
    footer: {
      backgroundColor: cDetails.primaryBackgroundColor,
      logoGapX: 80,
      padding: [60, 80],
    },
    content: {
      padding: [60, 80],
      backgroundColor: cDetails.baseBackgroundColor,
      // tabWidth: 10,
      gapX: 100,
      gapY: 80,
    },
    section: {
      backgroundColor: cDetails.primaryBackgroundColor,
    },
  };
  return slideDeckStyle;
}
