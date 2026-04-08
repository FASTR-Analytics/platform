// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type Language = "en" | "fr";

export type TranslatableString = {
  en: string;
  fr: string;
};

const _LANGUAGE: { lang: Language } = { lang: "en" };

export function setLanguage(language: Language): void {
  _LANGUAGE.lang = language;
}

export function getLanguage(): Language {
  return _LANGUAGE.lang;
}

export function isFrench(): boolean {
  return _LANGUAGE.lang === "fr";
}

export function t3(val: TranslatableString): string {
  if (_LANGUAGE.lang === "fr") {
    return val.fr;
  }
  return val.en;
}

export function resolveTS(val: TranslatableString, lang: Language): string {
  return lang === "fr" ? (val.fr || val.en) : val.en;
}
