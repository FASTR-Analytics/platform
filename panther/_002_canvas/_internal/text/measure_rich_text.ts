// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Dimensions,
  type MeasuredRichText,
  type MeasuredRichTextLine,
  type MeasuredRichTextSegment,
  type RichText,
  type TextInfoUnkeyed,
} from "../../deps.ts";
import type { TextRenderingOptions } from "../../text_rendering_options.ts";
import { applyStyleToTextInfo } from "../../rich_text_parser.ts";
import { setCtxFont } from "./set_ctx_font.ts";
import { findBestFontForText } from "./detect_char_support.ts";

export function measureRichText(
  ctx: CanvasRenderingContext2D,
  richText: RichText,
  maxWidth: number,
  textRenderingOptions?: TextRenderingOptions,
): MeasuredRichText {
  const lines: MeasuredRichTextLine[] = [];

  if (!richText.segments.length) {
    return {
      lines: [],
      dims: new Dimensions({ w: 0, h: 0 }),
      baseStyle: richText.baseStyle,
      rotation: "horizontal",
    };
  }

  // Process each segment to handle character support
  const processedSegments = richText.segments.map((segment) => {
    let effectiveTi = applyStyleToTextInfo(richText.baseStyle, segment.style);

    if (
      textRenderingOptions?.checkCharSupport &&
      textRenderingOptions.fallbackFonts.length > 0
    ) {
      const bestFont = findBestFontForText(
        segment.text,
        effectiveTi.font,
        textRenderingOptions.fallbackFonts,
      );
      effectiveTi = {
        ...effectiveTi,
        font: bestFont,
      };
    }

    return {
      text: segment.text,
      ti: effectiveTi,
      style: segment.style,
    };
  });

  // Calculate line height info from base style
  const extraForLineHeight = (richText.baseStyle.lineHeight / 1.2 - 1) *
    richText.baseStyle.fontSize;
  const extraForLineBreaks = richText.baseStyle.lineBreakGap === "none"
    ? 0
    : richText.baseStyle.lineBreakGap *
      richText.baseStyle.fontSize *
      richText.baseStyle.lineHeight;

  // Split text into words while preserving which segment they came from
  type Word = {
    text: string;
    segmentIndex: number;
    ti: TextInfoUnkeyed;
  };

  const words: Word[] = [];
  processedSegments.forEach((segment, segmentIndex) => {
    // Split on newlines first
    const lines = segment.text.split("\n");
    lines.forEach((line, lineIndex) => {
      const lineWords = line.split(" ").filter(Boolean);
      lineWords.forEach((word, wordIndex) => {
        words.push({
          text: word,
          segmentIndex,
          ti: segment.ti,
        });
        // Add newline marker after last word of each line (except the last line)
        if (
          lineIndex < lines.length - 1 &&
          wordIndex === lineWords.length - 1
        ) {
          words.push({
            text: "\n",
            segmentIndex,
            ti: segment.ti,
          });
        }
      });
    });
  });

  // Now perform line breaking
  let currentY = 0;
  let overallMaxWidth = 0;
  let currentLineSegments: MeasuredRichTextSegment[] = [];
  let currentLineWidth = 0;
  let currentX = 0;
  let maxAscentDescent = { ascent: 0, descent: 0 };

  function finishLine() {
    if (currentLineSegments.length === 0) return;

    currentY += maxAscentDescent.ascent;
    lines.push({
      segments: currentLineSegments,
      y: currentY,
      totalWidth: currentLineWidth,
    });
    overallMaxWidth = Math.max(overallMaxWidth, currentLineWidth);
    currentY += maxAscentDescent.descent + extraForLineHeight;

    currentLineSegments = [];
    currentLineWidth = 0;
    currentX = 0;
    maxAscentDescent = { ascent: 0, descent: 0 };
  }

  let currentSegmentText = "";
  let currentSegmentTi: TextInfoUnkeyed | null = null;
  let currentSegmentStartX = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    if (word.text === "\n") {
      // Finish current segment if any
      if (currentSegmentText && currentSegmentTi) {
        setCtxFont(ctx, currentSegmentTi, undefined);
        const segmentWidth = ctx.measureText(currentSegmentText.trim()).width;
        currentLineSegments.push({
          text: currentSegmentText.trim(),
          x: currentSegmentStartX,
          w: segmentWidth,
          ti: currentSegmentTi,
        });
        currentX = currentSegmentStartX + segmentWidth;
        currentLineWidth = currentX;
      }
      finishLine();
      currentSegmentText = "";
      currentSegmentTi = null;
      if (richText.baseStyle.lineBreakGap !== "none") {
        currentY += extraForLineBreaks;
      }
      continue;
    }

    // Check if we need to start a new segment (different style)
    if (currentSegmentTi && currentSegmentTi !== word.ti) {
      // Finish current segment
      setCtxFont(ctx, currentSegmentTi, undefined);
      const segmentWidth = ctx.measureText(currentSegmentText.trim()).width;
      currentLineSegments.push({
        text: currentSegmentText.trim(),
        x: currentSegmentStartX,
        w: segmentWidth,
        ti: currentSegmentTi,
      });
      currentX = currentSegmentStartX + segmentWidth;
      currentSegmentText = "";
      currentSegmentStartX = currentX;
    }

    // Test adding this word
    const spacePrefix = currentSegmentText ? " " : "";
    const testText = currentSegmentText + spacePrefix + word.text;
    setCtxFont(ctx, word.ti, undefined);
    const metrics = ctx.measureText(testText);
    const testWidth = currentSegmentStartX + metrics.width;

    const fontBoundingBoxAscent = metrics.fontBoundingBoxAscent;
    const fontBoundingBoxDescent = metrics.fontBoundingBoxDescent;
    if (
      fontBoundingBoxAscent === undefined ||
      fontBoundingBoxDescent === undefined
    ) {
      throw new Error("This renderer doesn't support text metrics");
    }

    // Update max ascent/descent for this line
    maxAscentDescent.ascent = Math.max(
      maxAscentDescent.ascent,
      fontBoundingBoxAscent,
    );
    maxAscentDescent.descent = Math.max(
      maxAscentDescent.descent,
      fontBoundingBoxDescent,
    );

    // Check if we need to wrap
    if (
      testWidth > maxWidth &&
      (currentLineSegments.length > 0 || currentSegmentText)
    ) {
      // Finish current segment
      if (currentSegmentText && currentSegmentTi) {
        setCtxFont(ctx, currentSegmentTi, undefined);
        const segmentWidth = ctx.measureText(currentSegmentText.trim()).width;
        currentLineSegments.push({
          text: currentSegmentText.trim(),
          x: currentSegmentStartX,
          w: segmentWidth,
          ti: currentSegmentTi,
        });
      }

      finishLine();

      // Start new line with this word
      currentSegmentText = word.text;
      currentSegmentTi = word.ti;
      currentSegmentStartX = 0;

      // Re-measure for new line
      setCtxFont(ctx, word.ti, undefined);
      const newMetrics = ctx.measureText(word.text);
      maxAscentDescent.ascent = newMetrics.fontBoundingBoxAscent || 0;
      maxAscentDescent.descent = newMetrics.fontBoundingBoxDescent || 0;
      currentLineWidth = newMetrics.width;
    } else {
      // Add word to current segment
      currentSegmentText = testText;
      currentSegmentTi = word.ti;
      currentLineWidth = testWidth;
    }
  }

  // Finish any remaining segment and line
  if (currentSegmentText && currentSegmentTi) {
    setCtxFont(ctx, currentSegmentTi, undefined);
    const segmentWidth = ctx.measureText(currentSegmentText.trim()).width;
    currentLineSegments.push({
      text: currentSegmentText.trim(),
      x: currentSegmentStartX,
      w: segmentWidth,
      ti: currentSegmentTi,
    });
    currentLineWidth = currentSegmentStartX + segmentWidth;
  }

  if (currentLineSegments.length > 0) {
    finishLine();
  }

  // Adjust final height
  currentY -= extraForLineHeight;
  if (
    richText.baseStyle.lineBreakGap !== "none" &&
    words[words.length - 1]?.text === "\n"
  ) {
    currentY -= extraForLineBreaks;
  }

  return {
    lines,
    dims: new Dimensions({ w: overallMaxWidth, h: Math.round(currentY) }),
    baseStyle: richText.baseStyle,
    rotation: "horizontal",
  };
}

export function measureVerticalRichText(
  ctx: CanvasRenderingContext2D,
  richText: RichText,
  maxHeight: number,
  rotation: "anticlockwise" | "clockwise",
  textRenderingOptions?: TextRenderingOptions,
): MeasuredRichText {
  const m = measureRichText(ctx, richText, maxHeight, textRenderingOptions);
  return {
    lines: m.lines,
    dims: m.dims.getTransposed(),
    baseStyle: richText.baseStyle,
    rotation,
  };
}
