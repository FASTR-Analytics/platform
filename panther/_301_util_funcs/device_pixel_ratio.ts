// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";

function readDevicePixelRatio(): number {
  return globalThis.devicePixelRatio || 1;
}

const [_devicePixelRatio, _setDevicePixelRatio] = createSignal(
  readDevicePixelRatio(),
);

// A resolution query matches one ratio, so each change arms a query on the
// new one.
function watchDevicePixelRatio(): void {
  globalThis
    .matchMedia(`(resolution: ${readDevicePixelRatio()}dppx)`)
    .addEventListener("change", () => {
      _setDevicePixelRatio(readDevicePixelRatio());
      watchDevicePixelRatio();
    }, { once: true });
}

if (typeof globalThis.matchMedia === "function") {
  watchDevicePixelRatio();
}

// Solid signal: an effect or a memo that reads it runs again when the ratio
// changes, as it does when a window moves to a screen of another density,
// the screen's scaling changes or the browser zooms.
export function getDevicePixelRatio(): number {
  return _devicePixelRatio();
}
