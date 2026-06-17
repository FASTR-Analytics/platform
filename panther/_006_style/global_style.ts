// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  setGlobalFigureStyle,
  setGlobalMarkdownStyle,
  setGlobalPageStyle,
} from "./deps.ts";
import type { GlobalStyleOptions } from "./custom_style_options.ts";

let _hasBeenSet = false;

export function setGlobalStyle(options: GlobalStyleOptions): void {
  assert(!_hasBeenSet, "Global styles have already been set");
  // baseText is a foundation — not a domain style. The type excludes it, but a
  // stale consumer could still pass it on a variable (structurally allowed), so
  // fail loudly instead of silently dropping it.
  assert(
    !("baseText" in options),
    "baseText is a foundation — set it via setBaseText(), not setGlobalStyle()",
  );
  _hasBeenSet = true;

  const { figure, markdown, page } = options;

  // Pass domain-specific options through
  setGlobalFigureStyle({
    ...figure,
  });

  setGlobalMarkdownStyle({
    ...markdown,
  });

  setGlobalPageStyle({
    ...page,
  });
}
