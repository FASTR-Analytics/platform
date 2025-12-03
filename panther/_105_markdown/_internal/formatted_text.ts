// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Coordinates,
  Dimensions,
  type MeasuredText,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../deps.ts";
import type {
  FormattedRun,
  FormattedRunStyle,
  FormattedText,
  MeasuredFormattedLine,
  MeasuredFormattedRun,
  MeasuredFormattedText,
} from "../types.ts";

// =============================================================================
// Chunk Types (internal)
// =============================================================================

type Chunk = {
  text: string;
  style: FormattedRunStyle;
  link?: { url: string };
  isSpace: boolean;
  isBreak: boolean;
};

type MeasuredChunk = Chunk & {
  mText: MeasuredText;
  ti: TextInfoUnkeyed;
};

// =============================================================================
// measureFormattedText
// =============================================================================

export function measureFormattedText(
  rc: RenderContext,
  text: FormattedText,
  maxWidth: number,
  align: "left" | "center" | "right",
  linkColor: string,
  linkUnderline: boolean,
): MeasuredFormattedText {
  if (text.runs.length === 0) {
    return {
      lines: [],
      dims: new Dimensions({ w: 0, h: 0 }),
      baseStyle: text.baseStyle,
      linkUnderline,
      maxWidth,
      align,
    };
  }

  const chunks = splitRunsIntoChunks(text.runs);
  const measuredChunks = measureChunks(rc, chunks, text.baseStyle, linkColor);
  const lines = wrapIntoLines(measuredChunks, maxWidth, linkUnderline);
  const lineHeight = text.baseStyle.fontSize * text.baseStyle.lineHeight;
  assignYPositions(lines, lineHeight);

  const totalHeight = lines.length * lineHeight;
  const maxLineWidth = Math.max(...lines.map((l) => l.totalWidth), 0);

  return {
    lines,
    dims: new Dimensions({ w: maxLineWidth, h: totalHeight }),
    baseStyle: text.baseStyle,
    linkUnderline,
    maxWidth,
    align,
  };
}

// =============================================================================
// renderFormattedText
// =============================================================================

export function renderFormattedText(
  rc: RenderContext,
  mText: MeasuredFormattedText,
  position: Coordinates,
): void {
  for (const line of mText.lines) {
    const lineX = mText.align === "left"
      ? position.x()
      : mText.align === "right"
      ? position.x() + mText.maxWidth - line.totalWidth
      : position.x() + (mText.maxWidth - line.totalWidth) / 2;

    const lineY = position.y() + line.y;

    for (const run of line.runs) {
      rc.rText(run.mText, { x: lineX + run.x, y: lineY }, "left", "top");

      if (run.underline) {
        rc.rLine(
          [
            { x: lineX + run.x, y: lineY + run.underline.yOffset },
            {
              x: lineX + run.x + run.mText.dims.w(),
              y: lineY + run.underline.yOffset,
            },
          ],
          {
            strokeWidth: 1,
            strokeColor: run.underline.color,
            lineDash: "solid",
            show: true,
          },
        );
      }
    }
  }
}

// =============================================================================
// resolveRunStyle
// =============================================================================

export function resolveRunStyle(
  baseStyle: TextInfoUnkeyed,
  runStyle: FormattedRunStyle,
): TextInfoUnkeyed {
  if (runStyle === "normal") {
    return baseStyle;
  }

  const isBold = runStyle === "bold" || runStyle === "bold-italic";
  const isItalic = runStyle === "italic" || runStyle === "bold-italic";

  if (isBold && isItalic && baseStyle.fontVariants?.boldAndItalic) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.boldAndItalic,
    };
  }

  if (isBold && !isItalic && baseStyle.fontVariants?.bold) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.bold,
    };
  }

  if (isItalic && !isBold && baseStyle.fontVariants?.italic) {
    return {
      ...baseStyle,
      font: baseStyle.fontVariants.italic,
    };
  }

  const result = { ...baseStyle, font: { ...baseStyle.font } };

  if (isBold) {
    result.font = {
      ...result.font,
      weight: result.font.weight <= 400 ? 700 : (Math.min(
        900,
        result.font.weight + 200,
      ) as typeof result.font.weight),
    };
  }

  if (isItalic) {
    result.font = {
      ...result.font,
      italic: true,
    };
  }

  return result;
}

// =============================================================================
// Internal Helpers
// =============================================================================

function splitRunsIntoChunks(runs: FormattedRun[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const run of runs) {
    const parts = run.text.split(/(\s+|\n)/);

    for (const part of parts) {
      if (part.length === 0) continue;

      if (part === "\n") {
        chunks.push({
          text: "",
          style: run.style,
          link: run.link,
          isSpace: false,
          isBreak: true,
        });
      } else {
        chunks.push({
          text: part,
          style: run.style,
          link: run.link,
          isSpace: /^\s+$/.test(part),
          isBreak: false,
        });
      }
    }
  }

  return chunks;
}

function measureChunks(
  rc: RenderContext,
  chunks: Chunk[],
  baseStyle: TextInfoUnkeyed,
  linkColor: string,
): MeasuredChunk[] {
  // Cache space measurement - space width is consistent across style variants
  const spaceMText = rc.mText(" ", baseStyle, 99999);

  return chunks.map((chunk) => {
    let ti = resolveRunStyle(baseStyle, chunk.style);
    if (chunk.link) {
      ti = { ...ti, color: linkColor };
    }
    const mText = chunk.isSpace ? spaceMText : rc.mText(chunk.text, ti, 99999);
    return { ...chunk, mText, ti };
  });
}

function wrapIntoLines(
  chunks: MeasuredChunk[],
  maxWidth: number,
  linkUnderline: boolean,
): MeasuredFormattedLine[] {
  const lines: MeasuredFormattedLine[] = [];
  let currentLine: MeasuredFormattedRun[] = [];
  let lineWidth = 0;

  for (const chunk of chunks) {
    const chunkWidth = chunk.mText.dims.w();

    if (chunk.isBreak) {
      lines.push(finalizeLine(currentLine, lineWidth));
      currentLine = [];
      lineWidth = 0;
      continue;
    }

    if (lineWidth + chunkWidth > maxWidth && currentLine.length > 0) {
      lines.push(finalizeLine(currentLine, lineWidth));
      currentLine = [];
      lineWidth = 0;

      if (chunk.isSpace) continue;
    }

    if (!chunk.isSpace || currentLine.length > 0) {
      const run: MeasuredFormattedRun = {
        mText: chunk.mText,
        x: lineWidth,
      };
      if (chunk.link && linkUnderline) {
        run.underline = {
          yOffset: chunk.ti.fontSize * 1.1,
          color: chunk.ti.color,
        };
      }
      currentLine.push(run);
      lineWidth += chunkWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(finalizeLine(currentLine, lineWidth));
  }

  if (lines.length === 0) {
    lines.push({ runs: [], y: 0, totalWidth: 0 });
  }

  return lines;
}

function finalizeLine(
  runs: MeasuredFormattedRun[],
  totalWidth: number,
): MeasuredFormattedLine {
  let trimmedWidth = totalWidth;
  for (let i = runs.length - 1; i >= 0; i--) {
    const runText = runs[i].mText.lines[0]?.text ?? "";
    if (/^\s+$/.test(runText)) {
      trimmedWidth -= runs[i].mText.dims.w();
    } else {
      break;
    }
  }
  return { runs, y: 0, totalWidth: trimmedWidth };
}

function assignYPositions(
  lines: MeasuredFormattedLine[],
  lineHeight: number,
): void {
  let y = 0;
  for (const line of lines) {
    line.y = y;
    y += lineHeight;
  }
}
