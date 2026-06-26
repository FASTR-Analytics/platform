// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";
import { Dynamic } from "solid-js/web";
import type { IconComponent, IconName } from "./icon_types.ts";
import { _ICON_MAP_TABLER } from "./icons_tabler.tsx";
import { _ICON_MAP_PHOSPHOR } from "./icons_phosphor.tsx";

export type IconSetName = "tabler" | "phosphor";

const ICON_SETS: Record<IconSetName, Record<IconName, IconComponent>> = {
  tabler: _ICON_MAP_TABLER,
  phosphor: _ICON_MAP_PHOSPHOR,
};

const CSS_VAR = "--panther-icon-set";
const DEFAULT_SET: IconSetName = "tabler";

// Reads `--panther-icon-set` off :root. Returns the default when there is no DOM
// (SSR) or the var is absent/unrecognized.
function readIconSetFromCss(): IconSetName {
  if (typeof document === "undefined") {
    return DEFAULT_SET;
  }
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(CSS_VAR)
    .trim();
  return raw === "tabler" || raw === "phosphor" ? raw : DEFAULT_SET;
}

// The active set is a signal whose initial value is read from the CSS var on
// first access. First access is the first icon render, by which point the app
// stylesheet is applied -- so `--panther-icon-set` drives the icons on its own,
// with no bootstrap call, and the first paint is already correct (no flash).
let store: ReturnType<typeof createSignal<IconSetName>> | undefined;
function signal(): ReturnType<typeof createSignal<IconSetName>> {
  if (store === undefined) {
    store = createSignal<IconSetName>(readIconSetFromCss());
  }
  return store;
}

export function getIconSet(): IconSetName {
  return signal()[0]();
}

// Imperative override (tests, runtime toggle, or apps that prefer JS to the CSS
// var). Takes precedence for the rest of the session.
export function setIconSet(name: IconSetName): void {
  signal()[1](name);
}

// Re-read the CSS var now. Only needed if an app changes `--panther-icon-set` at
// runtime; the initial value is already read automatically on first render.
export function initIconSetFromCss(): void {
  signal()[1](readIconSetFromCss());
}

// Resolves a key against the active set, falling back to the tabler glyph for
// any key the active set lacks. Returns undefined only for a key present in
// neither set (i.e. an invalid, non-IconName value reaching here at runtime).
export function resolveIcon(name: IconName): IconComponent | undefined {
  return ICON_SETS[getIconSet()][name] ?? _ICON_MAP_TABLER[name];
}

// Visible placeholder so an unresolved key is obvious, never a silent gap.
function FallbackIcon(p: { class?: string }) {
  return (
    <svg
      class={p.class ?? "h-[1.25em] w-[1.25em]"}
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" stroke-dasharray="3 3" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6 .3 -1 .9 -1 1.7" />
      <path d="M12 17h.01" />
    </svg>
  );
}

const warnedMissing = new Set<string>();

// Always returns something renderable: the resolved glyph, or a visible
// fallback (logged once per key) when the key resolves to nothing.
export function iconOrFallback(name: IconName): IconComponent {
  const resolved = resolveIcon(name);
  if (resolved) {
    return resolved;
  }
  if (!warnedMissing.has(name)) {
    warnedMissing.add(name);
    console.warn(
      `[panther] Unknown icon "${name}" — rendering fallback glyph.`,
    );
  }
  return FallbackIcon;
}

// Set-aware glyph: renders the active set's icon for `iconName` (or a visible
// fallback for an unknown key). Use where a raw svg with its own sizing wrapper
// is needed; IconRenderer is the padded form-control variant.
export function Icon(p: { iconName: IconName; class?: string }) {
  return <Dynamic component={iconOrFallback(p.iconName)} class={p.class} />;
}
