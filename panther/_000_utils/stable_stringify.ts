// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Key-order-independent serialization for JSON-shaped values: { a, b } and
// { b, a } serialize identically; undefined object values are dropped (as
// JSON.stringify does).
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));
  return `{${
    entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")
  }}`;
}

// Structural equality for JSON-shaped values (parsed payloads, op args),
// where serialize-and-compare IS deep equality.
export function isDeepEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}
