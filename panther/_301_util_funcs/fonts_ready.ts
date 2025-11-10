// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";

const [areFontsReady, setAreFontsReady] = createSignal(false);
const loadedFonts = new Set<string>();

function checkFonts() {
  if (typeof document === "undefined" || !document.fonts) {
    setAreFontsReady(true);
    return;
  }

  // Wait for document.fonts.ready first
  document.fonts.ready.then(() => {
    // Track which fonts have loaded to detect new ones
    document.fonts.forEach((font) => {
      if (font.status === "loaded") {
        const key = `${font.family}-${font.weight}-${font.style}`;
        loadedFonts.add(key);
      }
    });
    setAreFontsReady(true);
  });
}

// Initial check
checkFonts();

// Also listen for font load events for dynamic fonts
if (typeof document !== "undefined" && document.fonts) {
  document.fonts.addEventListener("loadingdone", () => {
    // Small delay to ensure all fonts are processed
    setTimeout(() => setAreFontsReady(true), 10);
  });
}

export function fontsReady(): boolean {
  return areFontsReady();
}

// Export a function to force a specific font to load (useful for canvas)
export function loadFont(
  fontFamily: string,
  text = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
) {
  if (typeof document === "undefined" || !document.fonts) return;

  // This forces the browser to load the font if it hasn't already
  document.fonts.load(`16px ${fontFamily}`, text).catch((err) => {
    console.warn(`Failed to load font '${fontFamily}':`, err);
  });
}
