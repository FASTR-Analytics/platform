// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMarkdownIt } from "../../deps.ts";

// Model text renders through innerHTML, so an image element would make the
// browser fetch any URL the model writes, data in its query string included.
export const md = createMarkdownIt({ images: false });
