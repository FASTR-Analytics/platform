// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomStyleTextOptions, TextInfoOptions } from "./deps.ts";

export const PAGE_TEXT_STYLE_KEYS = [
  "base",
  // Cover styles
  "coverTitle",
  "coverSubTitle",
  "coverAuthor",
  "coverDate",
  // Section styles
  "sectionTitle",
  "sectionSubTitle",
  // Regular page styles
  "header",
  "subHeader",
  "date",
  "footer",
  "pageNumber",
  "watermark",
] as const;

export type PageTextStyleKey = (typeof PAGE_TEXT_STYLE_KEYS)[number];

export type PageTextStyleOptions = {
  [K in PageTextStyleKey]?: K extends "base" ? TextInfoOptions
    : CustomStyleTextOptions;
};
