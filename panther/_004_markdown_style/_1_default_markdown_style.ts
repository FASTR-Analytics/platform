// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  FontKeyOrFontInfo,
  FontVariantsKeyed,
} from "./deps.ts";

export type MarkdownTextStyle = {
  font: FontKeyOrFontInfo;
  fontSize: number;
  color: ColorKeyOrString;
  lineHeight: number;
  fontVariants?: FontVariantsKeyed;
  align?: "left" | "center" | "right";
  marginTop?: number;
  marginBottom?: number;
};

export type MarkdownListStyle = {
  text: MarkdownTextStyle;
  level0: { marker: string; markerIndent: number; textIndent: number };
  level1: { marker: string; markerIndent: number; textIndent: number };
  level2: { marker: string; markerIndent: number; textIndent: number };
};

export type MarkdownBlockquoteStyle = {
  text: MarkdownTextStyle;
  leftBorderWidth: number;
  leftBorderColor: ColorKeyOrString;
  leftIndent: number;
  backgroundColor?: ColorKeyOrString;
};

export type MarkdownHorizontalRuleStyle = {
  strokeWidth: number;
  strokeColor: ColorKeyOrString;
  marginTop: number;
  marginBottom: number;
};

export type MarkdownLinkStyle = {
  color: ColorKeyOrString;
  underline: boolean;
};

const DEFAULT_BODY_TEXT: MarkdownTextStyle = {
  font: { key: "main400" },
  fontSize: 14,
  color: "#333333",
  lineHeight: 1.4,
  align: "left",
  marginTop: 12,
  marginBottom: 12,
  fontVariants: {
    bold: { key: "main700" },
  },
};

const _DS = {
  scale: 1,

  paragraph: DEFAULT_BODY_TEXT as MarkdownTextStyle,

  h1: {
    font: { key: "main700" },
    fontSize: 28,
    color: "#111111",
    lineHeight: 1.2,
    align: "left",
    marginTop: 24,
    marginBottom: 12,
  } as MarkdownTextStyle,

  h2: {
    font: { key: "main700" },
    fontSize: 24,
    color: "#111111",
    lineHeight: 1.2,
    align: "left",
    marginTop: 20,
    marginBottom: 10,
  } as MarkdownTextStyle,

  h3: {
    font: { key: "main700" },
    fontSize: 20,
    color: "#111111",
    lineHeight: 1.3,
    align: "left",
    marginTop: 16,
    marginBottom: 8,
  } as MarkdownTextStyle,

  h4: {
    font: { key: "main700" },
    fontSize: 16,
    color: "#111111",
    lineHeight: 1.3,
    align: "left",
    marginTop: 12,
    marginBottom: 6,
  } as MarkdownTextStyle,

  h5: {
    font: { key: "main700" },
    fontSize: 14,
    color: "#111111",
    lineHeight: 1.4,
    align: "left",
    marginTop: 10,
    marginBottom: 4,
  } as MarkdownTextStyle,

  h6: {
    font: { key: "main700" },
    fontSize: 12,
    color: "#333333",
    lineHeight: 1.4,
    align: "left",
    marginTop: 8,
    marginBottom: 4,
  } as MarkdownTextStyle,

  bulletList: {
    text: DEFAULT_BODY_TEXT,
    level0: { marker: "•", markerIndent: 0, textIndent: 20 },
    level1: { marker: "◦", markerIndent: 20, textIndent: 40 },
    level2: { marker: "▪", markerIndent: 40, textIndent: 60 },
  } as MarkdownListStyle,

  numberedList: {
    text: DEFAULT_BODY_TEXT,
    level0: { marker: ".", markerIndent: 0, textIndent: 24 },
    level1: { marker: ".", markerIndent: 24, textIndent: 48 },
    level2: { marker: ".", markerIndent: 48, textIndent: 72 },
  } as MarkdownListStyle,

  blockquote: {
    text: {
      ...DEFAULT_BODY_TEXT,
      color: "#555555",
      marginTop: 16,
      marginBottom: 16,
    },
    leftBorderWidth: 3,
    leftBorderColor: "#cccccc",
    leftIndent: 16,
    backgroundColor: undefined,
  } as MarkdownBlockquoteStyle,

  horizontalRule: {
    strokeWidth: 1,
    strokeColor: "#dddddd",
    marginTop: 16,
    marginBottom: 16,
  } as MarkdownHorizontalRuleStyle,

  link: {
    color: "#0066cc",
    underline: true,
  } as MarkdownLinkStyle,

  spacing: {
    paragraphGap: 12,
    listItemGap: 4,
    nestedListIndent: 20,
  },
};

export type DefaultMarkdownStyle = typeof _DS;

export function getDefaultMarkdownStyle(): DefaultMarkdownStyle {
  return _DS;
}
