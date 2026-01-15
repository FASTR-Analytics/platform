// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

// Set PANTHER_DEBUG=true to enable debug output
function getDebugFlag(): boolean {
  try {
    // deno-lint-ignore no-explicit-any
    const d = (globalThis as any).Deno;
    if (d) {
      return d.env.get("PANTHER_DEBUG") === "true";
    }
    return false;
  } catch {
    return false;
  }
}

export const PANTHER_DEBUG = getDebugFlag();
