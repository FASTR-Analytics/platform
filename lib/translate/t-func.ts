import {
  type Language,
  type TranslatableString,
} from "@timroberton/panther";
import { InstanceCalendar } from "../types/mod.ts";

export { getLanguage, setLanguage, t3 } from "@timroberton/panther";

export const LANGUAGE_STORAGE_KEY = "fastrLanguage";

const _CALENDAR: { cal: InstanceCalendar } = { cal: "gregorian" };

export function setCalendar(cal: InstanceCalendar) {
  _CALENDAR.cal = cal;
}

export function getCalendar(): InstanceCalendar {
  return _CALENDAR.cal;
}

export function pickLang(language: Language, s: TranslatableString): string {
  if (language === "pt") {
    return s.pt || s.en;
  }
  return language === "fr" ? s.fr : s.en;
}
