import { TextRenderingOptions, type CalendarType } from "@timroberton/panther";
import { InstanceCalendar, InstanceLanguage } from "../types/mod.ts";
import type { TranslatableString } from "./types.ts";

const _LANGUAGE: { lang: InstanceLanguage } = { lang: "en" };

export function setLanguage(language: InstanceLanguage) {
  _LANGUAGE.lang = language;
}

export function isFrench(): boolean {
  return _LANGUAGE.lang === "fr";
}

const _CALENDAR: { cal: InstanceCalendar } = { cal: "gregorian" };

export function setCalendar(cal: InstanceCalendar) {
  _CALENDAR.cal = cal;
}

export function getCalendar(): CalendarType {
  if (_LANGUAGE.lang === "fr") {
    return "french";
  }
  return _CALENDAR.cal;
}

export function t3(val: TranslatableString): string {
  if (_LANGUAGE.lang === "fr") {
    return val.fr;
  }
  return val.en;
}

export function getTextRenderingOptions(): TextRenderingOptions | undefined {
  if (_CALENDAR.cal === "ethiopian") {
    return {
      checkCharSupport: true,
      fallbackFonts: [
        {
          fontFamily: "Noto Sans Ethiopic",
          weight: 400,
          italic: false,
        },
        {
          fontFamily: "Noto Sans Ethiopic",
          weight: 800,
          italic: false,
        },
      ],
    };
  }
  return undefined;
}
