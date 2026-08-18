// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type Coordinates,
  Dimensions,
  type FontWeight,
  type MeasuredText,
  type RenderContext,
  type TextInfoUnkeyed,
} from "../deps.ts";
import type {
  FormattedRun,
  FormattedRunStyle,
  FormattedText,
  InlineCodeStyle,
  MeasuredFormattedLine,
  MeasuredFormattedRun,
  MeasuredFormattedText,
} from "../types.ts";

// Inline code background box, in em of the code font size (mirrors the HTML
// renderer's `px-[0.4em] py-[0.2em] rounded`).
const INLINE_CODE_PADDING_H_EM = 0.4;
const INLINE_CODE_PADDING_V_EM = 0.2;
const INLINE_CODE_RADIUS_EM = 0.25;

// =============================================================================
// Chunk Types (internal)
// =============================================================================

type Chunk = {
  text: string;
  style: FormattedRunStyle;
  link?: { url: string };
  isCode: boolean;
  isSpace: boolean;
  isBreak: boolean;
};

type MeasuredChunk = Chunk & {
  mText: MeasuredText;
  ti: TextInfoUnkeyed;
  // Full advance of the chunk on the line (text width plus any background
  // padding); `mText.dims.w()` is the text alone.
  width: number;
  background?: MeasuredFormattedRun["background"];
};

// =============================================================================
// measureFormattedText
// =============================================================================

export function measureFormattedText(
  rc: RenderContext,
  text: FormattedText,
  maxWidth: number,
  alignH: "left" | "center" | "right",
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
      alignH,
    };
  }

  const chunks = splitRunsIntoChunks(text.runs);
  const measuredChunks = measureChunks(
    rc,
    chunks,
    text.baseStyle,
    linkColor,
    text.codeStyle,
  );
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
    alignH,
  };
}

// =============================================================================
// renderFormattedText
// =============================================================================

type PlacedRun = { run: MeasuredFormattedRun; textX: number; runY: number };

function placeRuns(
  mText: MeasuredFormattedText,
  position: Coordinates,
): PlacedRun[] {
  const placed: PlacedRun[] = [];
  for (const line of mText.lines) {
    const lineX = mText.alignH === "left"
      ? position.x()
      : mText.alignH === "right"
      ? position.x() + mText.maxWidth - line.totalWidth
      : position.x() + (mText.maxWidth - line.totalWidth) / 2;
    const lineY = position.y() + line.y;
    for (const run of line.runs) {
      const runBaseline = run.mText.lines[0]?.y ?? 0;
      const runY = lineY + line.maxBaseline - runBaseline;
      const textX = lineX + run.x + (run.background?.paddingH ?? 0);
      placed.push({ run, textX, runY });
    }
  }
  return placed;
}

export function renderFormattedText(
  rc: RenderContext,
  mText: MeasuredFormattedText,
  position: Coordinates,
): void {
  const placed = placeRuns(mText, position);

  // Backgrounds first, so a padded box on one line never covers the
  // descenders of the line above.
  for (const { run, textX, runY } of placed) {
    if (run.background) {
      rc.rRect(
        {
          x: textX - run.background.paddingH,
          y: runY - run.background.paddingV,
          w: run.mText.dims.w() + run.background.paddingH * 2,
          h: run.mText.dims.h() + run.background.paddingV * 2,
        },
        {
          fillColor: run.background.color,
          rectRadius: run.background.radius,
        },
      );
    }
  }

  for (const { run, textX, runY } of placed) {
    rc.rText(
      run.mText,
      { x: textX, y: runY },
      "left",
      "top",
      run.link?.url,
    );

    if (run.underline) {
      rc.rLine(
        [
          { x: textX, y: runY + run.underline.yOffset },
          {
            x: textX + run.mText.dims.w(),
            y: runY + run.underline.yOffset,
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

// Line advance of an inline code span (text plus its background padding) —
// the unbreakable-word width the autofit floor must respect.
export function measureInlineCodeAdvance(
  rc: RenderContext,
  text: string,
  codeStyle: InlineCodeStyle,
): number {
  const mText = rc.mText(text, codeStyle.textInfo, 99999);
  return mText.dims.w() +
    codeStyle.textInfo.fontSize * INLINE_CODE_PADDING_H_EM * 2;
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

  return {
    ...baseStyle,
    font: {
      ...baseStyle.font,
      weight: isBold
        ? Math.max(baseStyle.font.weight, 700) as FontWeight
        : baseStyle.font.weight,
      italic: isItalic ? true : baseStyle.font.italic,
    },
  };
}

// =============================================================================
// Internal Helpers
// =============================================================================

function splitRunsIntoChunks(runs: FormattedRun[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const run of runs) {
    if (run.isCode) {
      chunks.push({
        text: run.text,
        style: run.style,
        link: run.link,
        isCode: true,
        isSpace: false,
        isBreak: false,
      });
      continue;
    }

    const parts = run.text.split(/(\s+|\n)/);

    for (const part of parts) {
      if (part.length === 0) continue;

      if (part === "\n") {
        chunks.push({
          text: "",
          style: run.style,
          link: run.link,
          isCode: false,
          isSpace: false,
          isBreak: true,
        });
      } else {
        chunks.push({
          text: part,
          style: run.style,
          link: run.link,
          isCode: false,
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
  codeStyle: InlineCodeStyle | undefined,
): MeasuredChunk[] {
  // Cache space measurement - space width is consistent across style variants
  const spaceMText = rc.mText(" ", baseStyle, 99999);

  return chunks.map((chunk) => {
    if (chunk.isCode && codeStyle) {
      const ti = codeStyle.textInfo;
      const mText = rc.mText(chunk.text, ti, 99999);
      const background = {
        color: codeStyle.backgroundColor,
        paddingH: ti.fontSize * INLINE_CODE_PADDING_H_EM,
        paddingV: ti.fontSize * INLINE_CODE_PADDING_V_EM,
        radius: ti.fontSize * INLINE_CODE_RADIUS_EM,
      };
      const width = mText.dims.w() + background.paddingH * 2;
      return { ...chunk, mText, ti, width, background };
    }
    let ti = resolveRunStyle(baseStyle, chunk.style);
    if (chunk.link) {
      ti = { ...ti, color: linkColor };
    }
    const mText = chunk.isSpace ? spaceMText : rc.mText(chunk.text, ti, 99999);
    return { ...chunk, mText, ti, width: mText.dims.w() };
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
    const chunkWidth = chunk.width;

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
      if (chunk.background) {
        run.background = chunk.background;
      }
      if (chunk.link) {
        run.link = chunk.link;
        if (linkUnderline) {
          run.underline = {
            yOffset: chunk.ti.fontSize * 1.1,
            color: chunk.ti.color,
          };
        }
      }
      currentLine.push(run);
      lineWidth += chunkWidth;
    }
  }

  if (currentLine.length > 0) {
    lines.push(finalizeLine(currentLine, lineWidth));
  }

  if (lines.length === 0) {
    lines.push({ runs: [], y: 0, totalWidth: 0, maxBaseline: 0 });
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

  const maxBaseline = runs.reduce((max, run) => {
    const baseline = run.mText.lines[0]?.y ?? 0;
    return Math.max(max, baseline);
  }, 0);

  return { runs, y: 0, totalWidth: trimmedWidth, maxBaseline };
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
