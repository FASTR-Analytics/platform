import {
  createTranslator,
  getLanguage as getPantherLanguage,
  setLanguage as setPantherLanguage,
} from "@timroberton/panther";
import { setReportForgeLanguage } from "../../report-forge/engine/i18n.ts";
import { InstanceCalendar } from "../types/mod.ts";
import type {
  Language,
  RequiredLanguage,
  TranslatableString,
} from "./types.ts";

export const { t3, resolveTS } = createTranslator<RequiredLanguage>();

// One language for the whole app: panther's strings and the report editor's
// (Report Forge keeps its own, so it can live outside this app).
export function setLanguage(language: Language): void {
  setPantherLanguage(language);
  setReportForgeLanguage(language);
}

// setLanguage above is the only writer of panther's global, so it never holds
// a language outside the app's three.
export function getLanguage(): Language {
  return getPantherLanguage() as Language;
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
