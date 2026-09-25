// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { BLANK_SENTINEL } from "./types.ts";

// Natural order for option lists, independent of the runtime's collation:
// digit runs compare numerically, case and diacritics are folded, and equal
// folded forms fall back to code-unit order so the order is total. The
// blank sentinel sorts last.
export function compareOptionValues(
  a: string | number,
  b: string | number,
): number {
  if (a === BLANK_SENTINEL || b === BLANK_SENTINEL) {
    return a === b ? 0 : a === BLANK_SENTINEL ? 1 : -1;
  }
  if (typeof a === "number" && typeof b === "number") {
    return a - b;
  }
  const sa = String(a);
  const sb = String(b);
  const natural = compareNatural(fold(sa), fold(sb));
  if (natural !== 0) {
    return natural;
  }
  return sa < sb ? -1 : sa > sb ? 1 : 0;
}

function fold(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

const CHUNK = /(\d+)|(\D+)/g;

function compareNatural(a: string, b: string): number {
  const ca = a.match(CHUNK) ?? [];
  const cb = b.match(CHUNK) ?? [];
  const n = Math.min(ca.length, cb.length);
  for (let i = 0; i < n; i++) {
    const x = ca[i];
    const y = cb[i];
    const xNum = /^\d/.test(x);
    const yNum = /^\d/.test(y);
    if (xNum && yNum) {
      const d = compareDigitRuns(x, y);
      if (d !== 0) {
        return d;
      }
    } else if (xNum !== yNum) {
      return xNum ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return ca.length - cb.length;
}

function compareDigitRuns(x: string, y: string): number {
  const tx = x.replace(/^0+(?=\d)/, "");
  const ty = y.replace(/^0+(?=\d)/, "");
  if (tx.length !== ty.length) {
    return tx.length - ty.length;
  }
  return tx < ty ? -1 : tx > ty ? 1 : 0;
}
