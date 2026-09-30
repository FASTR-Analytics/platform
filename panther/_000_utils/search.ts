// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The one normalisation panther applies before comparing text case- and
// accent-insensitively; the long-table sort and the table search share it.
export function foldString(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function searchTokens(query: string): string[] {
  return foldString(query).split(/\s+/).filter((t) => t.length > 0);
}

export function matchesSearch(
  foldedHaystack: string,
  tokens: string[],
): boolean {
  return tokens.every((t) => foldedHaystack.includes(t));
}
