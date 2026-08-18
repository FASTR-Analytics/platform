// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// The default level of a style cascade is authored as a plain literal and its
// type is derived from it (`type DefaultXStyle = typeof _DS`), so each value
// has to be widened from its literal type to the union the option actually
// accepts — otherwise `m(custom, global, default)` infers the narrow literal
// and rejects every other member of the union. Widen with this, not with
// `as T`: an assertion merely silences the checker (and will happily accept a
// wrong-but-overlapping value), while this checks that the value really is a T.
export function typed<T>(value: T): T {
  return value;
}

// A style option is dead when it exists on the custom options type but no
// merged type carries it (so no merge line can exist for it). Each style
// module asserts `MissingKeyPaths<CustomGroup, MergedGroup>` is never; the
// resulting union names every unmerged path, so the checker reports exactly
// which option was added without being wired. Nested objects are walked;
// unions, arrays and functions are leaves.
type IsPlainObject<T> = T extends (...args: never[]) => unknown ? false
  : T extends readonly unknown[] ? false
  : T extends object ? true
  : false;

export type MissingKeyPaths<C, M, P extends string = ""> = {
  [K in keyof C & string]-?: K extends keyof M ? [
      IsPlainObject<NonNullable<C[K]>>,
      IsPlainObject<NonNullable<M[K]>>,
    ] extends [true, true]
      ? MissingKeyPaths<NonNullable<C[K]>, NonNullable<M[K]>, `${P}${K}.`>
    : never
    : `${P}${K}`;
}[keyof C & string];

export type AssertNoMissingKeys<T extends never> = T;

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

export function msOrNone(
  sf: number,
  cs: "none" | number | undefined,
  gs: "none" | number | undefined,
  ds: "none" | number,
): number | "none" {
  const v = m(cs, gs, ds);
  if (v === "none") {
    return "none";
  }
  return sf * v;
}

export function msArea(
  sf: number,
  cs: number | undefined,
  gs: number | undefined,
  ds: number,
): number {
  return sf * sf * (cs ?? gs ?? ds);
}
