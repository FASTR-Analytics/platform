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
// - Image dimensions: Use pixels at 96 DPI (96 pixels = 1 inch)

// Aptos font family weight options (use these exact names):
// - "Aptos Light" - Light weight (300)
// - "Aptos" - Regular weight (400)
// - "Aptos SemiBold" - Semi-bold weight (600)
// - "Aptos Bold" - Bold weight (700)
// - "Aptos ExtraBold" - Extra bold weight (800)
// - "Aptos Black" - Black weight (900)

export type StyleConfig = typeof GITHUB_APTOS_STYLE_CONFIG;
export type StyleConfigId = "default" | "github-aptos" | "github-cambria";

export const GITHUB_APTOS_STYLE_CONFIG = {
  document: {
    font: "Aptos",
    fontSize: 22, // 11pt base size
    color: "000000",
    lineSpacing: 240, // 1.0x line spacing (single spacing)
    fontWeight: 400,
    paragraphSpaceBefore: 0, // mt-0
    paragraphSpaceAfter: 138, // 0.625em = 6.875pt = 137.5 twips ≈ 138
  },
  table: {
    borders: {
      color: "CACACA", // base-300 color
      size: 4, // Border width in eighths of a point (4 = 0.5pt)
      style: "single" as const,
    },
    headerShading: {
      fill: "F2F2F2", // base-200 color
      color: "auto",
      type: "clear" as const,
    },
    cellMargins: {
      top: 40, // 2pt = 40 twips (similar to py-2 padding)
      bottom: 40,
      left: 80, // 4pt = 80 twips (similar to px-4 padding)
      right: 80,
    },
    spaceBefore: 120, // Space before table
    spaceAfter: 120, // Space after table
  },
  headings: {
    h1: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 44, // 2em = 22pt (2 * 11pt)
      fontWeight: 800,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h2: {
      font: "Aptos ExtraBold",
      bold: false,
      size: 33, // 1.5em = 16.5pt (1.5 * 11pt)
      fontWeight: 700,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h3: {
      font: "Aptos",
      size: 27, // 1.25em = 13.75pt (1.25 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h4: {
      font: "Aptos",
      size: 22, // 1em = 11pt (1 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h5: {
      font: "Aptos",
      size: 19, // 0.875em = 9.625pt (0.875 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h6: {
      font: "Aptos",
      size: 19, // 0.875em = 9.625pt (0.875 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
  },
  list: {
    level0: {
      indent: 0.2,
      hanging: 0.2,
      bulletSymbol: "•",
      numberFormat: "%1.",
      spaceBefore: 0,
      spaceAfter: 55, // 0.25em = 2.75pt = 55 twips
      lineSpacing: 240, // 1.0x single spacing
    },
    level1: {
      indent: 0.4,
      hanging: 0.2,
      bulletSymbol: "–",
      numberFormat: "%2.",
      spaceBefore: 0,
      spaceAfter: 55,
      lineSpacing: 240,
    },
    level2: {
      indent: 0.6,
      hanging: 0.2,
      bulletSymbol: "▪",
      numberFormat: "%3.",
      spaceBefore: 0,
      spaceAfter: 55,
      lineSpacing: 240,
    },
  },
  image: {
    // Page width calculation: 8.5" (letter) - 0.8" left margin - 0.8" right margin = 6.9"
    maxWidthInches: 6.9, // Full width between margins
    defaultAspectRatio: 16 / 9, // Used when image dimensions unknown
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
    },
    orientation: PageOrientation.PORTRAIT,
  },
  footer: {
    alignment: AlignmentType.RIGHT,
    fontSize: 20, // 10pt
    showPageNumbers: true,
    format: "current_of_total",
  },
};

export const GITHUB_CAMBRIA_STYLE_CONFIG: StyleConfig = {
  document: {
    font: "Cambria",
    fontSize: 22, // 11pt base size
    color: "000000",
    lineSpacing: 240, // 1.0x line spacing (single spacing)
    fontWeight: 400,
    paragraphSpaceBefore: 0, // mt-0
    paragraphSpaceAfter: 138, // 0.625em = 6.875pt = 137.5 twips ≈ 138
  },
  table: {
    borders: {
      color: "CACACA", // base-300 color
      size: 4, // Border width in eighths of a point (4 = 0.5pt)
      style: "single" as const,
    },
    headerShading: {
      fill: "F2F2F2", // base-200 color
      color: "auto",
      type: "clear" as const,
    },
    cellMargins: {
      top: 40, // 2pt = 40 twips (similar to py-2 padding)
      bottom: 40,
      left: 80, // 4pt = 80 twips (similar to px-4 padding)
      right: 80,
    },
    spaceBefore: 120, // Space before table
    spaceAfter: 120, // Space after table
  },
  headings: {
    h1: {
      font: "Cambria",
      bold: true,
      size: 44, // 2em = 22pt (2 * 11pt)
      fontWeight: 800,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h2: {
      font: "Cambria",
      bold: true,
      size: 33, // 1.5em = 16.5pt (1.5 * 11pt)
      fontWeight: 700,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h3: {
      font: "Cambria",
      size: 27, // 1.25em = 13.75pt (1.25 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h4: {
      font: "Cambria",
      size: 22, // 1em = 11pt (1 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h5: {
      font: "Cambria",
      size: 19, // 0.875em = 9.625pt (0.875 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
    h6: {
      font: "Cambria",
      size: 19, // 0.875em = 9.625pt (0.875 * 11pt)
      bold: true,
      fontWeight: 600,
      color: "000000",
      spaceBefore: 330, // 24px = 1.5em = 16.5pt = 330 twips
      spaceAfter: 220, // 16px = 1em = 11pt = 220 twips
    },
  },
  list: {
    level0: {
      indent: 0.2,
      hanging: 0.2,
      bulletSymbol: "•",
      numberFormat: "%1.",
      spaceBefore: 0,
      spaceAfter: 55, // 0.25em = 2.75pt = 55 twips
      lineSpacing: 240, // 1.0x single spacing
    },
    level1: {
      indent: 0.4,
      hanging: 0.2,
      bulletSymbol: "–",
      numberFormat: "%2.",
      spaceBefore: 0,
      spaceAfter: 55,
      lineSpacing: 240,
    },
    level2: {
      indent: 0.6,
      hanging: 0.2,
      bulletSymbol: "▪",
      numberFormat: "%3.",
      spaceBefore: 0,
      spaceAfter: 55,
      lineSpacing: 240,
    },
  },
  image: {
    // Page width calculation: 8.5" (letter) - 0.8" left margin - 0.8" right margin = 6.9"
    maxWidthInches: 6.9, // Full width between margins
    defaultAspectRatio: 16 / 9, // Used when image dimensions unknown
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
    },
    orientation: PageOrientation.PORTRAIT,
  },
  footer: {
    alignment: AlignmentType.RIGHT,
    fontSize: 20, // 10pt
    showPageNumbers: true,
    format: "current_of_total",
  },
};

export const STYLE_CONFIGS = {
  "github-aptos": GITHUB_APTOS_STYLE_CONFIG,
  "github-cambria": GITHUB_CAMBRIA_STYLE_CONFIG,
};

export const STYLE_CONFIG = GITHUB_APTOS_STYLE_CONFIG;
