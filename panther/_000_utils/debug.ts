// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Set PANTHER_DEBUG=true to enable debug output
function getDebugFlag(): boolean {
  try {
    const d = (globalThis as {
      Deno?: { env: { get(key: string): string | undefined } };
    }).Deno;
    if (d) {
      return d.env.get("PANTHER_DEBUG") === "true";
    }
    return false;
  } catch {
    return false;
  }
}

export const PANTHER_DEBUG = getDebugFlag();

export function debugLog(...args: unknown[]): void {
  if (PANTHER_DEBUG) {
    console.log(...args);
  }
}
