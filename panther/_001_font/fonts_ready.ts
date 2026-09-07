// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { FontInfo } from "./types.ts";

export function loadFont(font: FontInfo): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }

  const style = font.italic ? "italic " : "";
  const fontString = `${style}${font.weight} 16px "${font.fontFamily}"`;

  // Resolves on failure: the font gate is best-effort, and a rejecting font
  // must not wedge consumers awaiting the gate (fallback metrics are used and
  // reported downstream).
  return document.fonts.load(fontString).then(
    (loaded) => {
      if (loaded.length === 0) {
        console.warn(`No matching font found for: ${fontString}`);
      }
    },
    () => {
      console.warn(`Font load failed (fallback metrics used): ${fontString}`);
    },
  );
}

const FONT_LOAD_TIMEOUT_MS = 3000;

export function loadFontsWithTimeout(fonts: FontInfo[]): Promise<void> {
  if (typeof document === "undefined" || !document.fonts) {
    return Promise.resolve();
  }

  if (fonts.length === 0) {
    return Promise.resolve();
  }

  const loadAll = Promise.all(fonts.map(loadFont)).then(() => {});
  const timeout = new Promise<void>((resolve) =>
    setTimeout(resolve, FONT_LOAD_TIMEOUT_MS)
  );

  return Promise.race([loadAll, timeout]);
}
