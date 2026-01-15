// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyleOptions,
  CustomMarkdownStyleOptions,
  CustomPageStyleOptions,
  TextInfoOptions,
} from "./deps.ts";

export type CustomStyleOptions = {
  // SHARED: Applied to all three style domains
  scale?: number;
  baseText?: TextInfoOptions;

  // NAMESPACED: Domain-specific options
  figure?: CustomFigureStyleOptions;
  markdown?: CustomMarkdownStyleOptions;
  page?: CustomPageStyleOptions;
};
