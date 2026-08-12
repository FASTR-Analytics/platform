// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";

export type SchemePreference = "system" | "light" | "dark";

// The JS-side complement to the data-scheme CSS contract (_fixed.css), for
// consumers that can't read CSS vars: canvas figures (FigureHolder), Clerk
// appearance objects, third-party lib configs. CSS styling itself never
// needs these — the light-dark() pairs follow the attribute on their own.
//
// Preference persistence (localStorage etc.) is the app's job: read the
// stored value at boot and call setSchemePreference with it. Apps that set
// the attribute in a pre-hydration inline script (to avoid a flash) are
// picked up by the initial attribute read below.

function readAttributePreference(): SchemePreference | null {
  if (typeof document === "undefined") {
    return null;
  }
  const v = document.documentElement.dataset.scheme;
  return v === "system" || v === "light" || v === "dark" ? v : null;
}

const [_preference, _setPreference] = createSignal<SchemePreference | null>(
  readAttributePreference(),
);

// The ONLY place the OS preference is read in JS.
const [_osPrefersDark, _setOsPrefersDark] = createSignal<boolean>(
  typeof globalThis.matchMedia === "function" &&
    globalThis.matchMedia("(prefers-color-scheme: dark)").matches,
);
if (typeof globalThis.matchMedia === "function") {
  globalThis
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", (e) => _setOsPrefersDark(e.matches));
}

export function setSchemePreference(pref: SchemePreference): void {
  document.documentElement.dataset.scheme = pref;
  _setPreference(pref);
}

// Solid signal: "light" | "dark" as actually rendered. Apps that never call
// setSchemePreference (and have no data-scheme attribute) always get "light".
export function effectiveScheme(): "light" | "dark" {
  const pref = _preference();
  if (pref === "dark") {
    return "dark";
  }
  if (pref === "system") {
    return _osPrefersDark() ? "dark" : "light";
  }
  return "light";
}
