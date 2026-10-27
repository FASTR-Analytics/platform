// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type Language = "en" | "fr" | "pt" | "th";

export type TranslatableString<L extends Language = Language> =
  & Record<L | "en", string>
  & Partial<Record<Language, string>>;

const _LANGUAGE: { lang: Language } = { lang: "en" };

export function setLanguage(language: Language): void {
  _LANGUAGE.lang = language;
}

export function getLanguage(): Language {
  return _LANGUAGE.lang;
}

export function createTranslator<L extends Language>() {
  function resolveTS(val: TranslatableString<L>, lang: Language): string {
    return val[lang] || val.en;
  }
  function t3(val: TranslatableString<L>): string {
    return resolveTS(val, _LANGUAGE.lang);
  }
  return { t3, resolveTS };
}

export const { t3, resolveTS } = createTranslator<Language>();

export type PluralForms<T> = { one: T; other: T };

// A bare "pt" resolves to Brazilian rules, where 0 is singular. Panther's
// Portuguese readers follow the European norm ("0 indicadores"), so the tag
// is pinned. CLDR gives French a "many" category for exact millions; no UI
// count reaches it, so every category but "one" collapses to "other".
const _PLURAL_LOCALE: Record<Language, string> = {
  en: "en",
  fr: "fr",
  pt: "pt-PT",
  th: "th",
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
