// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Color } from "./deps.ts";
import type {
  FormattedRunStyle,
  MeasuredFormattedText,
  MeasuredMarkdown,
  MeasuredMarkdownItem,
  MeasuredText,
  RectCoordsDims,
} from "./deps.ts";
import type { PptxSlide } from "./types.ts";
import {
  pixelsToInches,
  pixelsToPoints,
  rcdToSlidePosition,
} from "./pptx_units.ts";

type TextRun = { text: string; options?: Record<string, unknown> };

export function addMeasuredTextToSlide(
  slide: PptxSlide,
  mText: MeasuredText,
  bounds: RectCoordsDims,
): void {
  const text = mText.lines.map((line) => line.text).join("\n");
  if (!text.trim()) return;

  const ti = mText.ti;

  slide.addText(text, {
    ...rcdToSlidePosition(bounds),
    fontFace: ti.font.fontFamily,
    fontSize: pixelsToPoints(ti.fontSize),
    color: Color.toHexNoHash(ti.color),
    bold: ti.font.weight >= 700,
    italic: ti.font.italic ?? false,
    valign: "top",
    margin: 0,
  });
}

export function addMeasuredMarkdownToSlide(
  slide: PptxSlide,
  mMarkdown: MeasuredMarkdown,
  bounds: RectCoordsDims,
): void {
  // Group consecutive text items (paragraph, heading, list-item) into single text boxes
  // Keep blockquotes, code-blocks, and horizontal rules separate (they have special rendering)
  type TextItem = MeasuredMarkdownItem & {
    type: "paragraph" | "heading" | "list-item";
  };
  let accumulatedItems: TextItem[] = [];

  const flushTextBox = () => {
    if (accumulatedItems.length === 0) return;

    const textRuns: TextRun[] = [];

    for (let i = 0; i < accumulatedItems.length; i++) {
      const item = accumulatedItems[i];
      const prevItem = i > 0 ? accumulatedItems[i - 1] : null;
      const isLastItem = i === accumulatedItems.length - 1;

      // Get runs for this item
      const itemRuns = item.type === "list-item"
        ? getListItemRuns(item)
        : formattedTextToRuns(item.mFormattedText);

      if (itemRuns.length > 0) {
        // If not the first item, add paraSpaceBefore to the first run
        // This creates space before this paragraph (e.g., margin-top on headings)
        if (prevItem) {
          const gap = item.bounds.y() -
            (prevItem.bounds.y() + prevItem.bounds.h());
          const gapPts = pixelsToPoints(gap);

          const firstRun = itemRuns[0];
          firstRun.options = {
            ...firstRun.options,
            paraSpaceBefore: gapPts,
          };
        }

        // If not the last item, add breakLine to the last run to create paragraph break
        if (!isLastItem) {
          const lastRun = itemRuns[itemRuns.length - 1];
          lastRun.options = {
            ...lastRun.options,
            breakLine: true,
          };
        }

        textRuns.push(...itemRuns);
      }
    }

    if (textRuns.length > 0) {
      // Use first item's position and full container width
      // This ensures text boxes after blockquotes/code-blocks are positioned correctly
      const firstItem = accumulatedItems[0];
      const lastItem = accumulatedItems[accumulatedItems.length - 1];
      const textBoxHeight = lastItem.bounds.y() + lastItem.bounds.h() -
        firstItem.bounds.y();

      slide.addText(textRuns, {
        x: pixelsToInches(firstItem.bounds.x()),
        y: pixelsToInches(firstItem.bounds.y()),
        w: pixelsToInches(bounds.w()),
        h: pixelsToInches(textBoxHeight),
        valign: "top",
        margin: 0,
      });
    }

    accumulatedItems = [];
  };

  for (const item of mMarkdown.markdownItems) {
    const isTextItem = item.type === "paragraph" ||
      item.type === "heading" ||
      item.type === "list-item";

    if (isTextItem) {
      accumulatedItems.push(item as TextItem);
    } else {
      // Flush accumulated text items before rendering non-text item
      flushTextBox();

      // Render non-text items separately
      switch (item.type) {
        case "blockquote":
          addBlockquoteToSlide(slide, item);
          break;
        case "code-block":
          addCodeBlockToSlide(slide, item);
          break;
        case "horizontal-rule":
          addHorizontalRuleToSlide(slide, item);
          break;
      }
    }
  }

  // Flush any remaining text items
  flushTextBox();
}

function getListItemRuns(
  item: MeasuredMarkdownItem & { type: "list-item" },
): TextRun[] {
  const runs: TextRun[] = [];
  const markerText = item.marker.mText.lines.map((l) => l.text).join("");
  const markerTi = item.marker.mText.ti;

  if (markerText) {
    runs.push({
      text: markerText + " ",
      options: {
        fontFace: markerTi.font.fontFamily,
        fontSize: pixelsToPoints(markerTi.fontSize),
        color: Color.toHexNoHash(markerTi.color),
      },
    });
  }

  runs.push(...formattedTextToRuns(item.content.mFormattedText));
  return runs;
}

function addBlockquoteToSlide(
  slide: PptxSlide,
  item: MeasuredMarkdownItem & { type: "blockquote" },
): void {
  // Add border line
  slide.addShape("line", {
    x: pixelsToInches(item.border.line.start.x()),
    y: pixelsToInches(item.border.line.start.y()),
    w: 0,
    h: pixelsToInches(item.border.line.end.y() - item.border.line.start.y()),
    line: {
      color: Color.toHexNoHash(item.border.style.strokeColor),
      width: item.border.style.strokeWidth,
    },
  });

  // Combine all paragraphs into one text box
  const allRuns: TextRun[] = [];
  for (let i = 0; i < item.paragraphs.length; i++) {
    if (i > 0) {
      allRuns.push({ text: "\n\n", options: {} });
    }
    allRuns.push(...formattedTextToRuns(item.paragraphs[i].mFormattedText));
  }

  if (allRuns.length === 0) return;

  const firstPara = item.paragraphs[0];
  const lastPara = item.paragraphs[item.paragraphs.length - 1];
  const textBoxHeight = lastPara.position.y() +
    lastPara.mFormattedText.dims.h() -
    firstPara.position.y();

  slide.addText(allRuns, {
    x: pixelsToInches(firstPara.position.x()),
    y: pixelsToInches(firstPara.position.y()),
    w: pixelsToInches(firstPara.mFormattedText.dims.w()),
    h: pixelsToInches(textBoxHeight),
    valign: "top",
    margin: 0,
  });
}

function addCodeBlockToSlide(
  slide: PptxSlide,
  item: MeasuredMarkdownItem & { type: "code-block" },
): void {
  // Add background
  slide.addShape("rect", {
    ...rcdToSlidePosition(item.background.rcd),
    fill: { color: Color.toHexNoHash(item.background.color) },
    line: { color: Color.toHexNoHash(item.background.color), width: 0 },
  });

  const codeText = item.lines
    .map((line) => line.mText.lines.map((l) => l.text).join(""))
    .join("\n");

  if (codeText) {
    const firstLine = item.lines[0];
    const lastLine = item.lines[item.lines.length - 1];
    const ti = firstLine.mText.ti;

    // Calculate content height from first line to bottom of last line
    const contentHeight = lastLine.y + lastLine.mText.dims.h() - firstLine.y;

    slide.addText(codeText, {
      x: pixelsToInches(item.contentPosition.x()),
      y: pixelsToInches(item.contentPosition.y()),
      w: pixelsToInches(
        item.bounds.w() - (item.contentPosition.x() - item.bounds.x()) * 2,
      ),
      h: pixelsToInches(contentHeight),
      fontFace: ti.font.fontFamily,
      fontSize: pixelsToPoints(ti.fontSize),
      color: Color.toHexNoHash(ti.color),
      valign: "top",
      margin: 0,
    });
  }
}

function addHorizontalRuleToSlide(
  slide: PptxSlide,
  item: MeasuredMarkdownItem & { type: "horizontal-rule" },
): void {
  const color = typeof item.style.strokeColor === "string"
    ? item.style.strokeColor
    : "#cccccc";

  slide.addShape("line", {
    x: pixelsToInches(item.line.start.x()),
    y: pixelsToInches(item.line.start.y()),
    w: pixelsToInches(item.line.end.x() - item.line.start.x()),
    h: 0,
    line: {
      color: Color.toHexNoHash(color),
      width: item.style.strokeWidth,
    },
  });
}

function formattedTextToRuns(mFormattedText: MeasuredFormattedText): TextRun[] {
  const runs: TextRun[] = [];
  const baseStyle = mFormattedText.baseStyle;
  const baseFontFamily = baseStyle.font.fontFamily;
  const baseFontSize = pixelsToPoints(baseStyle.fontSize);
  const baseColor = baseStyle.color;

  // Preserve measured line breaks to match PDF layout
  for (let lineIdx = 0; lineIdx < mFormattedText.lines.length; lineIdx++) {
    const line = mFormattedText.lines[lineIdx];
    const needsSoftBreak = lineIdx > 0; // Soft break before lines after the first

    for (let runIdx = 0; runIdx < line.runs.length; runIdx++) {
      const run = line.runs[runIdx];
      const mText = run.mText;
      const text = mText.lines.map((l) => l.text).join("");
      if (!text) continue;

      const runStyle = getRunStyle(
        mText.ti.font.weight,
        mText.ti.font.italic ?? false,
      );
      const isBold = runStyle === "bold" || runStyle === "bold-italic";
      const isItalic = runStyle === "italic" || runStyle === "bold-italic";
      const isCode = mText.ti.font.fontFamily.toLowerCase().includes("mono") ||
        mText.ti.font.fontFamily.toLowerCase().includes("consolas");

      // Use the run's actual color (which may be link color) or base color
      const runColor = run.underline?.color ?? baseColor;

      const options: Record<string, unknown> = {
        fontFace: isCode ? "Consolas" : baseFontFamily,
        fontSize: baseFontSize,
        color: Color.toHexNoHash(runColor),
        bold: isBold,
        italic: isItalic,
      };

      // Add soft break before first run of each line (except first line)
      // softBreakBefore creates Shift+Enter, not a paragraph break
      if (needsSoftBreak && runIdx === 0) {
        options.softBreakBefore = true;
      }

      // Add hyperlink if this run is a link
      if (run.link) {
        options.hyperlink = { url: run.link.url };
      }

      runs.push({ text, options });
    }
  }

  return runs;
}

function getRunStyle(weight: number, italic: boolean): FormattedRunStyle {
  const isBold = weight >= 700;
  if (isBold && italic) return "bold-italic";
  if (isBold) return "bold";
  if (italic) return "italic";
  return "normal";
}
