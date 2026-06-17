// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomFigureStyleOptions,
  CustomMarkdownStyleOptions,
  CustomPageStyleOptions,
  TextInfoOptions,
} from "./deps.ts";

// Domain style options only. The foundations (key colors, base text) are set
// separately via setKeyColors() / setBaseText(). This is what setGlobalStyle takes.
export type GlobalStyleOptions = {
  figure?: CustomFigureStyleOptions;
  markdown?: CustomMarkdownStyleOptions;
  page?: CustomPageStyleOptions;
};

// Per-call custom style: domain options plus a baseText override applied to all
// three domains for this one render (CustomStyle / markdown-to-pdf / docs).
export type CustomStyleOptions = GlobalStyleOptions & {
  baseText?: TextInfoOptions;
};
