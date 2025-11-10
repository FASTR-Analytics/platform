// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { AlignmentType, PageOrientation } from "./deps.ts";

// Unit conversions for docx:
// - Font sizes: Use half-points (22 = 11pt)
// - Line spacing: Relative multiplier (240 = 1.0x font size, 360 = 1.5x, etc.)
// - Before/After spacing: Use twips (1 twip = 1/20 of a point, so 20 twips = 1pt)
// - Margins/Indents: Use inches with convertInchesToTwip() helper

// Aptos font family weight options (use these exact names):
// - "Aptos Light" - Light weight (300)
// - "Aptos" - Regular weight (400)
// - "Aptos SemiBold" - Semi-bold weight (600)
// - "Aptos Bold" - Bold weight (700)
// - "Aptos ExtraBold" - Extra bold weight (800)
// - "Aptos Black" - Black weight (900)

export type StyleConfig = typeof DEFAULT_STYLE_CONFIG;
export type StyleConfigId = "default" | "compact";

export const DEFAULT_STYLE_CONFIG = {
  document: {
    font: "Aptos",
    fontSize: 22, // docx uses half-points, so 22 = 11pt
    color: "000000",
    lineSpacing: 240, // Relative to font size: 240=1.0x, 276=1.15x, 288=1.2x, 360=1.5x, 480=2.0x
    fontWeight: 400, // Normal weight (400=normal, 700=bold)
  },
  headings: {
    h1: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 40, // 20pt (size is in half-points)
      fontWeight: 800, // Bold weight (can override with numeric values: 100-900)
      color: "000000",
      spaceBefore: 240, // Twips: 240 = 12pt spacing before
      spaceAfter: 240, // Twips: 240 = 12pt spacing after
    },
    h2: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 32, // 16
      fontWeight: 700, // Bold weight
      color: "000000",
      spaceBefore: 360,
      spaceAfter: 180, // 9pt
    },
    h3: {
      font: "Aptos",
      size: 28, // 14pt
      bold: true,
      fontWeight: 600, // Semi-bold weight
      color: "000000",
      spaceBefore: 240, // 9pt
      spaceAfter: 120, // 6pt
    },
    h4: {
      font: "Aptos",
      size: 22, // 11pt
      bold: true,
      fontWeight: 600, // Semi-bold weight
      color: "000000",
      spaceBefore: 180, // 6pt
      spaceAfter: 120, // 3pt
    },
    h5: {
      font: "Aptos",
      size: 22, // 11pt
      bold: true,
      fontWeight: 500, // Medium weight
      color: "000000",
      spaceBefore: 120, // 3pt
      spaceAfter: 60, // 3pt
    },
  },
  list: {
    // Level 0 (top level)
    level0: {
      indent: 0.2, // in inches - distance from left margin
      hanging: 0.2, // in inches - distance from bullet/number to text
      bulletSymbol: "•",
      numberFormat: "%1.", // 1. 2. 3.
      spaceBefore: 60, // Twips: vertical space before each list item (3pt)
      spaceAfter: 120, // Twips: vertical space after each list item (3pt)
      lineSpacing: 240, // Relative to font size: 240=1.0x (single spacing within items)
    },
    // Level 1 (first nested level)
    level1: {
      indent: 0.4, // in inches
      hanging: 0.2, // in inches
      bulletSymbol: "–", // En dash for level 1 (more subtle than hollow circle)
      numberFormat: "%2.", // 1. 2. 3. (could change to a. b. c.)
      spaceBefore: 60, // Twips: vertical space before each list item (3pt)
      spaceAfter: 120, // Twips: vertical space after each list item (3pt)
      lineSpacing: 240, // Relative to font size: 240=1.0x (single spacing within items)
    },
    // Level 2 (second nested level)
    level2: {
      indent: 0.6, // in inches
      hanging: 0.2, // in inches
      bulletSymbol: "▪", // Small square for level 2
      numberFormat: "%3.", // 1. 2. 3. (could change to i. ii. iii.)
      spaceBefore: 60, // Twips: vertical space before each list item (3pt)
      spaceAfter: 120, // Twips: vertical space after each list item (3pt)
      lineSpacing: 240, // Relative to font size: 240=1.0x (single spacing within items)
    },
  },
  link: {
    color: "0563C1",
    underline: true,
  },
  page: {
    margins: {
      top: 0.8,
      bottom: 0.8,
      left: 0.8,
      right: 0.8,
    }, // in inches
    orientation: PageOrientation.PORTRAIT,
  },
  footer: {
    alignment: AlignmentType.RIGHT, // CENTER, LEFT, or RIGHT
    fontSize: 20, // 10pt (in half-points)
    showPageNumbers: true,
    format: "current_of_total", // Options: "current_only", "current_of_total"
  },
};

export const COMPACT_STYLE_CONFIG: StyleConfig = {
  document: {
    font: "Aptos",
    fontSize: 22, // 11pt
    color: "000000",
    lineSpacing: 240,
    fontWeight: 400,
  },
  headings: {
    h1: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 28, // 14pt
      fontWeight: 800,
      color: "000000",
      spaceBefore: 360,
      spaceAfter: 180,
    },
    h2: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 26, // 13pt
      fontWeight: 700,
      color: "000000",
      spaceBefore: 360,
      spaceAfter: 120, // 6pt
    },
    h3: {
      font: "Aptos",
      size: 24, // 12pt
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 180, // 9pt
      spaceAfter: 60, // 3pt
    },
    h4: {
      font: "Aptos",
      size: 22, // 11pt
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 120,
      spaceAfter: 60,
    },
    h5: {
      font: "Aptos",
      size: 22, // 11pt
      bold: true,
      fontWeight: 500,
      color: "000000",
      spaceBefore: 60,
      spaceAfter: 60,
    },
  },
  list: {
    level0: {
      indent: 0.2,
      hanging: 0.2,
      bulletSymbol: "•",
      numberFormat: "%1.",
      spaceBefore: 40, // 2pt
      spaceAfter: 80, // 4pt
      lineSpacing: 240,
    },
    level1: {
      indent: 0.4,
      hanging: 0.2,
      bulletSymbol: "–",
      numberFormat: "%2.",
      spaceBefore: 40,
      spaceAfter: 80,
      lineSpacing: 240,
    },
    level2: {
      indent: 0.6,
      hanging: 0.2,
      bulletSymbol: "▪",
      numberFormat: "%3.",
      spaceBefore: 40,
      spaceAfter: 80,
      lineSpacing: 240,
    },
  },
  link: {
    color: "0563C1",
    underline: true,
  },
  page: {
    margins: {
      top: 0.6,
      bottom: 0.6,
      left: 0.6,
      right: 0.6,
    },
    orientation: PageOrientation.PORTRAIT,
  },
  footer: {
    alignment: AlignmentType.RIGHT,
    fontSize: 18, // 9pt
    showPageNumbers: false,
    format: "current_of_total",
  },
};

export const STYLE_CONFIGS: Record<StyleConfigId, StyleConfig> = {
  default: DEFAULT_STYLE_CONFIG,
  compact: COMPACT_STYLE_CONFIG,
};

export const STYLE_CONFIG = DEFAULT_STYLE_CONFIG;
