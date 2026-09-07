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

// Inline code background box, in em of the code font size (padding mirrors
// the HTML renderer's `px-[0.4em] py-[0.2em]`; HTML's `rounded` is the app's
// fixed --radius, approximated here as an em).
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
  // Code spans split into words like any run; the span's outer padding sits
  // on its first and last chunk only, so a span wrapped across lines reads as
  // one box sliced at the line edge (as CSS box-decoration-break: slice).
  code?: { start: boolean; end: boolean };
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

export function renderFormattedText(
  rc: RenderContext,
  mText: MeasuredFormattedText,
  position: Coordinates,
): void {
  const placed = placeRuns(mText, position);

  // Backgrounds first, so a padded box on one line never covers the
  // descenders of the line above. Adjacent runs of one code span share a box.
  for (const box of coalesceBackgrounds(placed)) {
    rc.rRect(box.rcd, { fillColor: box.color, rectRadius: box.radius });
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

// Widest unbreakable unit of an inline code span (a word plus the padding it
// carries) — what the autofit floor must respect.
export function measureInlineCodeAdvance(
  rc: RenderContext,
  text: string,
  codeStyle: InlineCodeStyle,
): number {
  const chunks = measureChunks(
    rc,
    splitRunsIntoChunks([{ text, style: "normal", isCode: true }]),
    codeStyle.textInfo,
    codeStyle.textInfo.color,
    codeStyle,
  );
  return chunks.reduce((max, c) => c.isSpace ? max : Math.max(max, c.width), 0);
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

type PlacedRun = { run: MeasuredFormattedRun; textX: number; runY: number };

type BackgroundBox = {
  rcd: { x: number; y: number; w: number; h: number };
  color: string;
  radius: number;
};

function coalesceBackgrounds(placed: PlacedRun[]): BackgroundBox[] {
  const boxes: BackgroundBox[] = [];
  let open: BackgroundBox | undefined;
  let openRunY: number | undefined;
  for (const { run, textX, runY } of placed) {
    const bg = run.background;
    if (!bg) {
      open = undefined;
      continue;
    }
    const left = textX - bg.paddingLeft;
    const right = textX + run.mText.dims.w() + bg.paddingRight;
    const contiguous = open !== undefined && openRunY === runY &&
      open.color === bg.color &&
      Math.abs(open.rcd.x + open.rcd.w - left) < 0.01;
    if (contiguous && open) {
      open.rcd.w = right - open.rcd.x;
      continue;
    }
    open = {
      rcd: {
        x: left,
        y: runY - bg.paddingV,
        w: right - left,
        h: run.mText.dims.h() + bg.paddingV * 2,
      },
      color: bg.color,
      radius: bg.radius,
    };
    openRunY = runY;
    boxes.push(open);
  }
  return boxes;
}

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
      const textX = lineX + run.x + (run.background?.paddingLeft ?? 0);
      placed.push({ run, textX, runY });
    }
  }
  return placed;
}

function splitRunsIntoChunks(runs: FormattedRun[]): Chunk[] {
  const chunks: Chunk[] = [];

  for (const run of runs) {
    const parts = run.text.split(/(\s+|\n)/).filter((p) => p.length > 0);

    parts.forEach((part, i) => {
      if (part === "\n") {
        chunks.push({
          text: "",
          style: run.style,
          link: run.link,
          isSpace: false,
          isBreak: true,
        });
        return;
      }
      chunks.push({
        text: part,
        style: run.style,
        link: run.link,
        code: run.isCode
          ? { start: i === 0, end: i === parts.length - 1 }
          : undefined,
        isSpace: /^\s+$/.test(part),
        isBreak: false,
      });
    });
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
  const codeSpaceMText = codeStyle
    ? rc.mText(" ", codeStyle.textInfo, 99999)
    : undefined;

  return chunks.map((chunk) => {
    if (chunk.code && codeStyle && codeSpaceMText) {
      const ti = codeStyle.textInfo;
      const mText = chunk.isSpace
        ? codeSpaceMText
        : rc.mText(chunk.text, ti, 99999);
      const paddingH = ti.fontSize * INLINE_CODE_PADDING_H_EM;
      const background = {
        color: codeStyle.backgroundColor,
        paddingLeft: chunk.code.start ? paddingH : 0,
        paddingRight: chunk.code.end ? paddingH : 0,
        paddingV: ti.fontSize * INLINE_CODE_PADDING_V_EM,
        radius: ti.fontSize * INLINE_CODE_RADIUS_EM,
      };
      const width = mText.dims.w() + background.paddingLeft +
        background.paddingRight;
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

// Lines break only at whitespace: chunks glued by a style boundary (`x`. or
// **bold**tail) move to the next line together, and a glued run wider than the
// line overflows like any single long word.
function wrapIntoLines(
  chunks: MeasuredChunk[],
  maxWidth: number,
  linkUnderline: boolean,
): MeasuredFormattedLine[] {
  const lines: MeasuredFormattedLine[] = [];
  let current: MeasuredChunk[] = [];
  let lineWidth = 0;

  const flush = () => {
    lines.push(finalizeLine(current, linkUnderline));
    current = [];
    lineWidth = 0;
  };

  for (const chunk of chunks) {
    if (chunk.isBreak) {
      flush();
      continue;
    }

    if (lineWidth + chunk.width > maxWidth && current.length > 0) {
      if (chunk.isSpace) {
        flush();
        continue;
      }
      const lastSpace = current.map((c) => c.isSpace).lastIndexOf(true);
      if (lastSpace === current.length - 1) {
        flush();
      } else if (lastSpace >= 0) {
        const glued = current.slice(lastSpace + 1);
        current = current.slice(0, lastSpace + 1);
        flush();
        current = glued;
        lineWidth = glued.reduce((w, c) => w + c.width, 0);
      }
    }

    if (!chunk.isSpace || current.length > 0) {
      current.push(chunk);
      lineWidth += chunk.width;
    }
  }

  if (current.length > 0) {
    flush();
  }

  if (lines.length === 0) {
    lines.push({ runs: [], y: 0, totalWidth: 0, maxBaseline: 0 });
  }

  return lines;
}

function finalizeLine(
  chunks: MeasuredChunk[],
  linkUnderline: boolean,
): MeasuredFormattedLine {
  const runs: MeasuredFormattedRun[] = [];
  let x = 0;
  for (const chunk of chunks) {
    const run: MeasuredFormattedRun = { mText: chunk.mText, x };
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
    runs.push(run);
    x += chunk.width;
  }

  let trimmedWidth = x;
  for (let i = chunks.length - 1; i >= 0 && chunks[i].isSpace; i--) {
    trimmedWidth -= chunks[i].width;
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
