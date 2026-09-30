// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type Language = "en" | "fr" | "pt";

export type TranslatableString = {
  en: string;
  fr: string;
  pt?: string;
};

const _LANGUAGE: { lang: Language } = { lang: "en" };

export function setLanguage(language: Language): void {
  _LANGUAGE.lang = language;
}

export function getLanguage(): Language {
  return _LANGUAGE.lang;
}

export function t3(val: TranslatableString): string {
  return resolveTS(val, _LANGUAGE.lang);
}

export function resolveTS(val: TranslatableString, lang: Language): string {
  if (lang === "pt") {
    return val.pt || val.en;
  }
  if (lang === "fr") {
    return val.fr || val.en;
  }
  return val.en;
}

export type PluralForms<T> = { one: T; other: T };

// A bare "pt" resolves to Brazilian rules, where 0 is singular. Panther's
// Portuguese readers follow the European norm ("0 indicadores"), so the tag
// is pinned. CLDR gives French a "many" category for exact millions; no UI
// count reaches it, so every category but "one" collapses to "other".
const _PLURAL_LOCALE: Record<Language, string> = {
  en: "en",
  fr: "fr",
  pt: "pt-PT",
};

const _PLURAL_RULES = new Map<Language, Intl.PluralRules>();

export function pluralForm(n: number): keyof PluralForms<unknown> {
  const lang = getLanguage();
  let rules = _PLURAL_RULES.get(lang);
  if (!rules) {
    rules = new Intl.PluralRules(_PLURAL_LOCALE[lang]);
    _PLURAL_RULES.set(lang, rules);
  }
  return rules.select(n) === "one" ? "one" : "other";
}

export function plural<T>(n: number, forms: PluralForms<T>): T {
  return forms[pluralForm(n)];
}
