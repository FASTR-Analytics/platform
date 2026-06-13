import { type CalendarType } from "@timroberton/panther";
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

export function pickLang(language: "en" | "fr", s: { en: string; fr: string }): string {
  return language === "fr" ? s.fr : s.en;
}
