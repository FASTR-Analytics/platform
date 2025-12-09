// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { FONT_KERNING } from "./deps.ts";
import type { jsPDF } from "jspdf";

/**
 * Injects kerning data into a jsPDF font.
 *
 * jsPDF parses TTF files and extracts widths, but doesn't read the GPOS table
 * for kerning pairs. This function injects pre-extracted kerning pairs.
 *
 * Note: jsPDF only applies kerning when using the "Unicode" code path
 * (when widthOfString is undefined). For TTF fonts, widthOfString exists,
 * so kerning pairs are injected but not automatically applied.
 *
 * To fully enable kerning for TTF fonts, we also patch jsPDF's text rendering
 * to apply kerning adjustments.
 *
 * Call this immediately after `pdf.addFont()` for each custom font.
 */
export function injectKerningIntoJsPdf(
  pdf: jsPDF,
  fontInfoId: string,
  fontFamily: string,
  fontStyle: string,
  fontWeight: string,
): void {
  const fontData = FONT_KERNING[fontInfoId];

  // If no kerning data for this font, skip injection
  if (!fontData) {
    return;
  }

  // Access the internal font that jsPDF just registered
  const internalFont = (pdf as any).internal.getFont(
    fontFamily,
    fontStyle,
    fontWeight,
  );

  if (!internalFont?.metadata?.Unicode) {
    return;
  }

  // Inject kerning pairs
  // jsPDF format: kerning[rightCharCode][leftCharCode] = adjustment
  // fof (fraction of) is the divisor for the adjustment values
  // Using negative unitsPerEm to match the sign convention
  internalFont.metadata.Unicode.kerning = {
    ...fontData.pairs,
    fof: -fontData.unitsPerEm,
  };

  // Store kerning data for our custom text rendering
  internalFont.metadata._kerningData = fontData;
}

/**
 * Patches jsPDF to apply kerning when rendering text with TTF fonts.
 * Uses the PDF TJ operator for efficient kerning (single operator per string).
 *
 * Call this once before using the pdf instance for text rendering.
 */
export function patchJsPdfForKerning(pdf: jsPDF): void {
  const pdfAny = pdf as any;

  if (pdfAny.__kerningPatched) {
    return;
  }
  pdfAny.__kerningPatched = true;

  const originalText = pdfAny.text.bind(pdf);

  pdfAny.text = function (
    text: string | string[],
    x: number,
    y: number,
    options?: any,
  ) {
    const font = pdfAny.internal.getFont();
    const kerningData = font?.metadata?._kerningData;

    if (!kerningData || typeof text !== "string" || text.length < 2) {
      return originalText(text, x, y, options);
    }

    // Check if any kerning pairs actually exist in this text
    let hasKerning = false;
    for (let i = 0; i < text.length - 1; i++) {
      const leftCode = text[i].charCodeAt(0);
      const rightCode = text[i + 1].charCodeAt(0);
      if (kerningData.pairs[rightCode]?.[leftCode]) {
        hasKerning = true;
        break;
      }
    }

    if (!hasKerning) {
      return originalText(text, x, y, options);
    }

    const fontSize = pdfAny.getFontSize();
    const scale = fontSize / kerningData.unitsPerEm;
    const scaleFactor = pdfAny.internal.scaleFactor;

    // Calculate total width with kerning for alignment
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      totalWidth += pdfAny.getTextWidth(text[i]);
      if (i < text.length - 1) {
        const leftCode = text[i].charCodeAt(0);
        const rightCode = text[i + 1].charCodeAt(0);
        const kernValue = kerningData.pairs[rightCode]?.[leftCode] ?? 0;
        totalWidth += kernValue * scale;
      }
    }

    // Adjust position for alignment
    const align = options?.align ?? "left";
    let startX = x;
    if (align === "center") {
      startX = x - totalWidth / 2;
    } else if (align === "right") {
      startX = x - totalWidth;
    }

    // Check if this is a TTF font with Identity-H encoding (needs hex glyph IDs)
    const isIdentityH = font.encoding === "Identity-H";
    const characterToGlyph = font.metadata?.characterToGlyph;
    const useHex = isIdentityH && typeof characterToGlyph === "function";

    // Build TJ array with kerning adjustments
    // Kern values are in thousandths of text space unit
    // Positive moves left, negative moves right
    let tjArray = "[";
    for (let i = 0; i < text.length; i++) {
      const char = text[i];

      if (useHex) {
        // TTF font: convert to hex-encoded glyph ID
        const glyphId = characterToGlyph.call(
          font.metadata,
          char.charCodeAt(0),
        );
        // Track glyph for font subsetting
        if (font.metadata.glyIdsUsed) {
          font.metadata.glyIdsUsed.push(glyphId);
        }
        if (font.metadata.toUnicode) {
          font.metadata.toUnicode[glyphId] = char.charCodeAt(0);
        }
        // Track width for font descriptor
        const widths = font.metadata.Unicode?.widths;
        if (widths && widths.indexOf(glyphId) === -1) {
          widths.push(glyphId);
          widths.push([parseInt(font.metadata.widthOfGlyph(glyphId), 10)]);
        }
        const hex = glyphId.toString(16).padStart(4, "0");
        tjArray += `<${hex}>`;
      } else {
        // Standard font: use escaped character
        const escaped = pdfEscapeChar(char);
        tjArray += `(${escaped})`;
      }

      if (i < text.length - 1) {
        const leftCode = char.charCodeAt(0);
        const rightCode = text[i + 1].charCodeAt(0);
        const kernValue = kerningData.pairs[rightCode]?.[leftCode] ?? 0;
        if (kernValue !== 0) {
          // Convert font units to thousandths of text space
          // Kerning data: negative = tighter, TJ: positive = move left
          const tjKern = Math.round(-kernValue * 1000 / kerningData.unitsPerEm);
          tjArray += ` ${tjKern}`;
        }
      }
    }
    tjArray += "] TJ";

    // Get PDF coordinates
    const pdfX = startX * scaleFactor;
    const pageHeight = pdfAny.internal.pageSize.getHeight();
    const pdfY = (pageHeight - y) * scaleFactor;

    // Handle rotation if specified
    let transformMatrix = "";
    if (options?.angle) {
      const angle = options.angle * Math.PI / 180;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      transformMatrix = `${hpf(cos)} ${hpf(sin)} ${hpf(-sin)} ${hpf(cos)} ${
        hpf(pdfX)
      } ${hpf(pdfY)} Tm`;
    } else {
      transformMatrix = `${hpf(pdfX)} ${hpf(pdfY)} Td`;
    }

    // Build and output the text block
    const fontKey = font.id;
    // getFontSize() returns activeFontSize which jsPDF outputs directly to Tf
    const fontSizeTf = fontSize;

    // Get current text color in PDF format
    // getTextColor() returns hex (#rrggbb), need to convert to PDF format
    const hexColor = pdfAny.getTextColor?.() ?? "#000000";
    const textColor = hexToPdfColor(hexColor);

    const content = [
      "BT",
      `/${fontKey} ${hpf(fontSizeTf)} Tf`,
      textColor,
      transformMatrix,
      tjArray,
      "ET",
    ].join("\n");

    pdfAny.internal.write(content);

    return pdf;
  };
}

function hexToPdfColor(hex: string): string {
  // Convert hex color (#rrggbb) to PDF color format (r g b rg)
  if (!hex || hex === "#000000") return "0 g";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  // If grayscale, use simpler format
  if (r === g && g === b) {
    return `${hpf(r)} g`;
  }
  return `${hpf(r)} ${hpf(g)} ${hpf(b)} rg`;
}

function pdfEscapeChar(char: string): string {
  if (char === "\\") return "\\\\";
  if (char === "(") return "\\(";
  if (char === ")") return "\\)";
  return char;
}

function hpf(n: number): string {
  // High precision float formatting (matches jsPDF internal)
  return n.toFixed(4).replace(/\.?0+$/, "");
}

/**
 * Legacy: Patches jsPDF using character-by-character rendering.
 * Less efficient (creates many Tj operators) but simpler fallback.
 *
 * @deprecated Use patchJsPdfForKerning instead
 */
export function patchJsPdfForKerningCharByChar(pdf: jsPDF): void {
  const pdfAny = pdf as any;

  if (pdfAny.__kerningPatched) {
    return;
  }
  pdfAny.__kerningPatched = true;

  const originalText = pdfAny.text.bind(pdf);

  pdfAny.text = function (
    text: string | string[],
    x: number,
    y: number,
    options?: any,
  ) {
    const font = pdfAny.internal.getFont();
    const kerningData = font?.metadata?._kerningData;

    if (!kerningData || typeof text !== "string" || text.length < 2) {
      return originalText(text, x, y, options);
    }

    const fontSize = pdfAny.getFontSize();
    const scale = fontSize / kerningData.unitsPerEm;

    // First pass: calculate total width with kerning
    let totalWidth = 0;
    for (let i = 0; i < text.length; i++) {
      const charWidth = pdfAny.getTextWidth(text[i]);
      totalWidth += charWidth;
      if (i < text.length - 1) {
        const leftCode = text[i].charCodeAt(0);
        const rightCode = text[i + 1].charCodeAt(0);
        const kernValue = kerningData.pairs[rightCode]?.[leftCode] ?? 0;
        totalWidth += kernValue * scale;
      }
    }

    // Adjust starting x based on alignment
    const align = options?.align ?? "left";
    let currentX = x;
    if (align === "center") {
      currentX = x - totalWidth / 2;
    } else if (align === "right") {
      currentX = x - totalWidth;
    }

    // Second pass: render each character with left alignment
    const charOptions = options ? { ...options, align: "left" } : undefined;

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      originalText(char, currentX, y, charOptions);

      const charWidth = pdfAny.getTextWidth(char);
      if (i < text.length - 1) {
        const leftCode = char.charCodeAt(0);
        const rightCode = text[i + 1].charCodeAt(0);
        const kernValue = kerningData.pairs[rightCode]?.[leftCode] ?? 0;
        currentX += charWidth + kernValue * scale;
      }
    }

    return pdf;
  };
}
