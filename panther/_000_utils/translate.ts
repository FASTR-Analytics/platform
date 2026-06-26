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
