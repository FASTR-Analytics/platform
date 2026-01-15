// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  setBaseText,
  setGlobalFigureStyle,
  setGlobalMarkdownStyle,
  setGlobalPageStyle,
} from "./deps.ts";
import type { CustomStyleOptions } from "./custom_style_options.ts";

let _hasBeenSet = false;

export function setGlobalStyle(options: CustomStyleOptions): void {
  assert(!_hasBeenSet, "Global styles have already been set");
  _hasBeenSet = true;

  const { scale, baseText, figure, markdown, page } = options;

  // Set base text at the font layer (foundation for all style domains)
  if (baseText) {
    setBaseText(baseText);
  }

  // Pass domain-specific options through
  setGlobalFigureStyle({
    scale,
    ...figure,
  });

  setGlobalMarkdownStyle({
    scale,
    ...markdown,
  });

  setGlobalPageStyle({
    scale,
    ...page,
  });
}
