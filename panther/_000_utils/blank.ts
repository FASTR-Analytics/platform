// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { TranslatableString } from "./translate.ts";

export const BLANK_SENTINEL = "__BLANK";

// The characters a text cell may hold and still be blank: every character
// JavaScript's trim() strips (the ECMAScript WhiteSpace and LineTerminator
// sets). The validator and the SQL fold both read this one constant, so a
// cell is never a named option that a filter refuses as blank.
export const BLANK_CHARACTERS =
  "\t\n\v\f\r \u00A0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007" +
  "\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000\uFEFF";

export function isBlankText(s: string): boolean {
  for (const ch of s) {
    if (!BLANK_CHARACTERS.includes(ch)) {
      return false;
    }
  }
  return true;
}

export function isBlankValue(v: unknown): boolean {
  return v === undefined || v === null ||
    (typeof v === "string" && isBlankText(v));
}

export const BLANK_LABEL: TranslatableString = {
  en: "(Blank)",
  fr: "(Vide)",
  pt: "(Em branco)",
  th: "(ว่าง)",
};
