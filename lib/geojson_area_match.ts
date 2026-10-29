import { foldString } from "@timroberton/panther";

// Accents fold as panther's search and sort fold them, so "Boké" proposes
// "Boke". A proposal only: the wizard shows every pairing before a save.
export function normalizeAreaName(name: string): string {
  return foldString(name.replace(/\s+/g, " ").trim());
}

export type AreaNameMapping = {
  mapping: Record<string, string>;
  unmatched: string[];
};

// An exact name wins; otherwise a normalized name maps only when exactly one
// admin area carries it, so two areas that differ only by accent or case are
// left for the user rather than guessed between.
export function autoMapAreaNames(
  sourceNames: readonly string[],
  adminAreaNames: readonly string[],
): AreaNameMapping {
  const exact = new Set(adminAreaNames);
  const byNormalized = new Map<string, string[]>();
  for (const name of adminAreaNames) {
    const key = normalizeAreaName(name);
    byNormalized.set(key, [...(byNormalized.get(key) ?? []), name]);
  }
  const mapping: Record<string, string> = {};
  const unmatched: string[] = [];
  for (const source of sourceNames) {
    const candidates = byNormalized.get(normalizeAreaName(source)) ?? [];
    const match = exact.has(source)
      ? source
      : candidates.length === 1
      ? candidates[0]
      : undefined;
    if (match === undefined) unmatched.push(source);
    else mapping[source] = match;
  }
  return { mapping, unmatched };
}
