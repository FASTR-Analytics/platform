// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString } from "./deps.ts";

const _DS = {
  scale: 1,

  headingRelFontSizes: {
    h1: 2.0,
    h2: 1.5,
    h3: 1.25,
  },

  marginsEm: {
    paragraph: { top: 1, bottom: 0 },
    h1: { top: 0.9, bottom: 0 },
    h2: { top: 0.95, bottom: 0 },
    h3: { top: 1, bottom: 0 },
    h4: { top: 1, bottom: 0 },
    h5: { top: 1, bottom: 0 },
    h6: { top: 1, bottom: 0 },
    list: { top: 0.5, bottom: 1, gap: 0.5 },
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
    leftBorderColor: { key: "baseContent" } as ColorKeyOrString,
    paddingEm: {
      top: 0.25,
      bottom: 0.25,
      left: 0.75,
      right: 0,
    },
    paragraphGapEm: 0.5,
    align: "left" as "left" | "center" | "right",
    backgroundColor: "none" as ColorKeyOrString | "none",
  },

  // Code styling
  code: {
    backgroundColor: { key: "base200" } as ColorKeyOrString,
    paddingEm: {
      horizontal: 1,
      vertical: 1,
    },
  },

  // Horizontal rule
  horizontalRule: {
    strokeWidth: 1,
    strokeColor: { key: "base300" } as ColorKeyOrString,
  },

  // Link styling
  link: {
    color: "#0066cc" as ColorKeyOrString,
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
      color: { key: "base300" } as ColorKeyOrString,
      style: "single" as "single" | "double" | "dotted",
    },
    cellPaddingEm: {
      horizontal: 0.5,
      vertical: 0.25,
    },
    headerShading: {
      color: { key: "base200" } as ColorKeyOrString,
      opacity: 1,
    },
  },

  // Math display alignment
  math: {
    displayAlign: "center" as "left" | "center" | "right",
  },
};

export type DefaultMarkdownStyle = typeof _DS;

export function getDefaultMarkdownStyle(): DefaultMarkdownStyle {
  return _DS;
}
