// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createMarkdownIt,
  deriveMarkdownCssVars,
  MARKDOWN_BASE_STYLES,
} from "../../deps.ts";

export const md = createMarkdownIt();

export { deriveMarkdownCssVars, MARKDOWN_BASE_STYLES };
