// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  assert,
  type ColorKeyOrString,
  type FontKeyOrFontInfo,
} from "./deps.ts";
import type { FontVariantsKeyed } from "./deps.ts";

export type CustomMarkdownTextStyleOptions = {
  font?: FontKeyOrFontInfo;
  fontSize?: number;
  color?: ColorKeyOrString;
  lineHeight?: number;
  fontVariants?: FontVariantsKeyed;
  align?: "left" | "center" | "right";
  marginTop?: number;
  marginBottom?: number;
};

export type CustomMarkdownListStyleOptions = {
  text?: CustomMarkdownTextStyleOptions;
  level0?: { marker?: string; markerIndent?: number; textIndent?: number };
  level1?: { marker?: string; markerIndent?: number; textIndent?: number };
  level2?: { marker?: string; markerIndent?: number; textIndent?: number };
};

export type CustomMarkdownBlockquoteStyleOptions = {
  text?: CustomMarkdownTextStyleOptions;
  leftBorderWidth?: number;
  leftBorderColor?: ColorKeyOrString;
  leftIndent?: number;
  backgroundColor?: ColorKeyOrString;
};

export type CustomMarkdownHorizontalRuleStyleOptions = {
  strokeWidth?: number;
  strokeColor?: ColorKeyOrString;
  marginTop?: number;
  marginBottom?: number;
};

export type CustomMarkdownLinkStyleOptions = {
  color?: ColorKeyOrString;
  underline?: boolean;
};

export type CustomMarkdownStyleOptions = {
  scale?: number;
  paragraph?: CustomMarkdownTextStyleOptions;
  h1?: CustomMarkdownTextStyleOptions;
  h2?: CustomMarkdownTextStyleOptions;
  h3?: CustomMarkdownTextStyleOptions;
  h4?: CustomMarkdownTextStyleOptions;
  h5?: CustomMarkdownTextStyleOptions;
  h6?: CustomMarkdownTextStyleOptions;
  bulletList?: CustomMarkdownListStyleOptions;
  numberedList?: CustomMarkdownListStyleOptions;
  blockquote?: CustomMarkdownBlockquoteStyleOptions;
  horizontalRule?: CustomMarkdownHorizontalRuleStyleOptions;
  link?: CustomMarkdownLinkStyleOptions;
  spacing?: {
    paragraphGap?: number;
    listItemGap?: number;
    nestedListIndent?: number;
  };
};

let _GS: CustomMarkdownStyleOptions | undefined = undefined;

export function setGlobalMarkdownStyle(gs: CustomMarkdownStyleOptions): void {
  assert(_GS === undefined, "Global markdown styles have already been set");
  _GS = gs;
}

export function getGlobalMarkdownStyle(): CustomMarkdownStyleOptions {
  return _GS ?? {};
}
