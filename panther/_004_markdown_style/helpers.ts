// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function m<T>(cs: T | undefined, gs: T | undefined, ds: T): T {
  return cs ?? gs ?? ds;
}

export function ms(
  sf: number,
  cs: number | undefined,
  gs: number | undefined,
  ds: number,
): number {
  return sf * (cs ?? gs ?? ds);
}
