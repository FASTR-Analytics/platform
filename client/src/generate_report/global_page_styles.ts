import { _COLOR_WATERMARK_GREY, _COLOR_WATERMARK_WHITE } from "lib";
import { CustomPageStyleOptions, TIM_FONTS } from "panther";

export const _GLOBAL_PAGE_STYLE_OPTIONS: CustomPageStyleOptions = {
  scale: 1,
  text: {
    base: {
      font: {
        fontFamily: "Inter",
        weight: 400,
        italic: false,
      },
    },
    watermark: {
      font: {
        fontFamily: "Inter",
        weight: 800,
        italic: false,
      },
      color: _COLOR_WATERMARK_GREY,
      relFontSize: 25,
      lineHeight: 1.4,
    },
  },
};
