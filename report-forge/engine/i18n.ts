// ⚠️  SYNCED FROM report-forge (github.com/NicholasWillmott/report-forge)
// ⚠️  DO NOT EDIT HERE - changes are overwritten on the next sync.
//     Edit the report-forge repo, then run its ./sync.

// The interface language of everything Report Forge draws or writes for the
// reader (toolbar labels, the page footer). Strings
// are written inline, once per language, where they are used:
//
//   t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })
//
// One language for the whole page, set by the host (the mounted editor's
// `language` input does it; a host that only uses the engine calls
// setReportForgeLanguage itself). English until told otherwise.

export const REPORT_FORGE_LANGUAGES = ["en", "fr", "pt"] as const;
export type ReportForgeLanguage = (typeof REPORT_FORGE_LANGUAGES)[number];

// Portuguese is optional: a string without it reads in English.
export type ReportForgeText = { en: string; fr: string; pt?: string };

let current: ReportForgeLanguage = "en";

export function setReportForgeLanguage(language: ReportForgeLanguage): void {
  current = language;
}

export function getReportForgeLanguage(): ReportForgeLanguage {
  return current;
}

export function t3(text: ReportForgeText): string {
  if (current === "pt") return text.pt || text.en;
  return current === "fr" ? text.fr : text.en;
}

// Singular or plural, by the current language's rules (French counts 0 as
// singular, English does not):
//
//   `${n} ${plural(n, { one: t3({...}), other: t3({...}) })}`
const PLURAL_LOCALE: Record<ReportForgeLanguage, string> = {
  en: "en",
  fr: "fr",
  pt: "pt-PT",
};
const pluralRules = new Map<ReportForgeLanguage, Intl.PluralRules>();

export function plural<T>(n: number, forms: { one: T; other: T }): T {
  let rules = pluralRules.get(current);
  if (!rules) {
    rules = new Intl.PluralRules(PLURAL_LOCALE[current]);
    pluralRules.set(current, rules);
  }
  return rules.select(n) === "one" ? forms.one : forms.other;
}
