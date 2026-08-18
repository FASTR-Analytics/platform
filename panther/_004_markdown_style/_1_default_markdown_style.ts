// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { AlignH, ColorKeyOrString, FontInfoOptions } from "./deps.ts";
import { typed } from "./deps.ts";

const _DS = {
  alignH: typed<AlignH>("left"),

  headingRelFontSizes: {
    h1: 1.5,
    h2: 1.25,
    h3: 1.125,
  },

  // Default-level font adjustments per text key (applied under global/custom).
  // Every other key inherits the base font.
  textFonts: {
    code: typed<FontInfoOptions>({ fontFamily: "Fira Mono" }),
  },

  marginsEm: {
    paragraph: { top: 1, bottom: 0 },
    h1: { top: 0.9, bottom: 0 },
    h2: { top: 0.95, bottom: 0 },
    h3: { top: 1, bottom: 0 },
    h4: { top: 1, bottom: 0 },
    h5: { top: 1, bottom: 0 },
    h6: { top: 1, bottom: 0 },
    list: { top: 0.5, bottom: 0.5, gap: 0.5 },
    image: { top: 1, bottom: 1.5 },
    table: { top: 1, bottom: 1.5 },
    blockquote: { top: 1.5, bottom: 1.5 },
    horizontalRule: { top: 1.5, bottom: 1.5 },
    code: { top: 1.5, bottom: 1.5 },
  },

  // List-specific structure
  bulletList: {
    level0: { marker: "•", markerIndentEm: 0, textIndentEm: 1.714 },
    level1: { marker: "◦", markerIndentEm: 1.714, textIndentEm: 3.429 },
    level2: { marker: "▪", markerIndentEm: 3.429, textIndentEm: 5.143 },
  },

  numberedList: {
    level0: { marker: ".", markerIndentEm: 0, textIndentEm: 1.714 },
    level1: { marker: ".", markerIndentEm: 1.714, textIndentEm: 3.429 },
    level2: { marker: ".", markerIndentEm: 3.429, textIndentEm: 5.143 },
  },

  // Blockquote
  blockquote: {
    leftBorderWidth: 3,
    leftBorderColor: typed<ColorKeyOrString>({ key: "baseContent" }),
    paddingEm: {
      top: 0.25,
      bottom: 0.25,
      left: 0.75,
      right: 0,
    },
    paragraphGapEm: 0.5,
    alignH: typed<AlignH>("left"),
    backgroundColor: typed<ColorKeyOrString | "none">("none"),
  },

  // Code styling
  code: {
    backgroundColor: typed<ColorKeyOrString>({ key: "base200" }),
    paddingEm: {
      horizontal: 1,
      vertical: 1,
    },
  },

  // Horizontal rule
  horizontalRule: {
    strokeWidth: 1,
    strokeColor: typed<ColorKeyOrString>({ key: "base300" }),
  },

  // Link styling
  link: {
    color: typed<ColorKeyOrString>("#0066cc"),
    underline: true,
  },

  // Image styling
  image: {
    defaultAspectRatio: 16 / 9,
  },

  // Table styling
  table: {
    border: {
      width: 1,
      color: typed<ColorKeyOrString>({ key: "base300" }),
      style: typed<"single" | "double" | "dotted">("single"),
    },
    cellPaddingEm: {
      horizontal: 0.5,
      vertical: 0.25,
    },
    headerShading: {
      color: typed<ColorKeyOrString>({ key: "base200" }),
      opacity: 1,
    },
  },
};

export type DefaultMarkdownStyle = typeof _DS;

export function getDefaultMarkdownStyle(): DefaultMarkdownStyle {
  return _DS;
}
