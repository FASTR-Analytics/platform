import { TextRenderingOptions, type CalendarType } from "@timroberton/panther";
import { InstanceCalendar } from "../types/mod.ts";

export { isFrench, setLanguage, getLanguage, t3 } from "@timroberton/panther";

export const LANGUAGE_STORAGE_KEY = "fastrLanguage";

const _CALENDAR: { cal: InstanceCalendar } = { cal: "gregorian" };

export function setCalendar(cal: InstanceCalendar) {
  _CALENDAR.cal = cal;
}

export function getCalendar(): CalendarType {
  return _CALENDAR.cal;
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
