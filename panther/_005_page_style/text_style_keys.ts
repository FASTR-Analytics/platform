// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { CustomStyleTextOptions, TextInfoOptions } from "./deps.ts";

// Canonical source of truth for all page text style keys
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
  "paragraph",
  "pageNumber",
  "watermark",
  // Bullet styles
  "bullet1",
  "bullet2",
  "bullet3",
] as const;

// Extract the type from the const array
export type PageTextStyleKey = (typeof PAGE_TEXT_STYLE_KEYS)[number];

// Type for the text options object - base uses TextInfoOptions, others use CustomStyleTextOptions
export type PageTextStyleOptions = {
  [K in PageTextStyleKey]?: K extends "base" ? TextInfoOptions
    : CustomStyleTextOptions;
};
