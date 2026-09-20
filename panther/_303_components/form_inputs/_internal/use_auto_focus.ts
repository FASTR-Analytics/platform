// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { onCleanup } from "solid-js";

export function useAutoFocus(el: HTMLElement, shouldFocus?: boolean) {
  if (shouldFocus) {
    const handle = setTimeout(() => el.focus());
    onCleanup(() => clearTimeout(handle));
  }
}
