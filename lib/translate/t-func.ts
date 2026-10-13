import {
  type Language,
  setLanguage as setPantherLanguage,
  type TranslatableString,
} from "@timroberton/panther";
import { setReportForgeLanguage } from "../../report-forge/engine/i18n.ts";
import { InstanceCalendar } from "../types/mod.ts";

export { getLanguage, t3 } from "@timroberton/panther";

// One language for the whole app: panther's strings and the report editor's
// (Report Forge keeps its own, so it can live outside this app).
export function setLanguage(language: Language): void {
  setPantherLanguage(language);
  setReportForgeLanguage(language);
}

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
