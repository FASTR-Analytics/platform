// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  FontKeyOrFontInfo,
  FontVariantsKeyed,
} from "./deps.ts";

export type MergedMarkdownTextStyle = {
  font: FontKeyOrFontInfo;
  fontSize: number;
  color: ColorKeyOrString;
  lineHeight: number;
  fontVariants?: FontVariantsKeyed;
  align: "left" | "center" | "right";
  marginTop: number;
  marginBottom: number;
};

export type MergedMarkdownListLevelStyle = {
  marker: string;
  markerIndent: number;
  textIndent: number;
};

export type MergedMarkdownListStyle = {
  text: MergedMarkdownTextStyle;
  level0: MergedMarkdownListLevelStyle;
  level1: MergedMarkdownListLevelStyle;
  level2: MergedMarkdownListLevelStyle;
};

export type MergedMarkdownBlockquoteStyle = {
  text: MergedMarkdownTextStyle;
  leftBorderWidth: number;
  leftBorderColor: ColorKeyOrString;
  leftIndent: number;
  backgroundColor: ColorKeyOrString | undefined;
};

export type MergedMarkdownHorizontalRuleStyle = {
  strokeWidth: number;
  strokeColor: ColorKeyOrString;
  marginTop: number;
  marginBottom: number;
};

export type MergedMarkdownLinkStyle = {
  color: ColorKeyOrString;
  underline: boolean;
};

export type MergedMarkdownSpacingStyle = {
  paragraphGap: number;
  listItemGap: number;
  nestedListIndent: number;
};

export type MergedMarkdownStyle = {
  paragraph: MergedMarkdownTextStyle;
  h1: MergedMarkdownTextStyle;
  h2: MergedMarkdownTextStyle;
  h3: MergedMarkdownTextStyle;
  h4: MergedMarkdownTextStyle;
  h5: MergedMarkdownTextStyle;
  h6: MergedMarkdownTextStyle;
  bulletList: MergedMarkdownListStyle;
  numberedList: MergedMarkdownListStyle;
  blockquote: MergedMarkdownBlockquoteStyle;
  horizontalRule: MergedMarkdownHorizontalRuleStyle;
  link: MergedMarkdownLinkStyle;
  spacing: MergedMarkdownSpacingStyle;
};
