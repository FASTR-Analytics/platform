// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  type MergedMarkdownStyle,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type {
  FormattedRun,
  FormattedText,
  MarkdownInline,
  MeasuredMarkdownBlockquote,
  MeasuredMarkdownCodeBlock,
  MeasuredMarkdownHeading,
  MeasuredMarkdownHorizontalRule,
  MeasuredMarkdownItem,
  MeasuredMarkdownListItem,
  MeasuredMarkdownParagraph,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "../types.ts";
import { measureFormattedText } from "./formatted_text.ts";

export type MeasuredMarkdownItemsResult = {
  bounds: RectCoordsDims;
  items: MeasuredMarkdownItem[];
};

export function measureMarkdownItems(
  rc: RenderContext,
  bounds: RectCoordsDims,
  parsed: ParsedMarkdown,
  style: MergedMarkdownStyle,
): MeasuredMarkdownItemsResult {
  const items: MeasuredMarkdownItem[] = [];
  let currentY = bounds.y();
  const maxWidth = bounds.w();
  let prevMarginBottom = 0;

  for (let i = 0; i < parsed.items.length; i++) {
    const parsedItem = parsed.items[i];
    const margins = getItemMargins(parsedItem, style);
    const isFirst = i === 0;

    const gap = isFirst ? 0 : Math.max(prevMarginBottom, margins.marginTop);
    currentY += gap;

    const item = measureItem(
      rc,
      parsedItem,
      bounds.x(),
      currentY,
      maxWidth,
      style,
    );
    items.push(item);

    currentY += item.bounds.h();
    prevMarginBottom = margins.marginBottom;
  }

  const totalHeight = currentY - bounds.y();

  return {
    bounds: new RectCoordsDims({
      x: bounds.x(),
      y: bounds.y(),
      w: maxWidth,
      h: totalHeight,
    }),
    items,
  };
}

type ItemMargins = { marginTop: number; marginBottom: number };

function getItemMargins(
  item: ParsedMarkdownItem,
  style: MergedMarkdownStyle,
): ItemMargins {
  switch (item.type) {
    case "paragraph": {
      const m = style.margins.paragraph;
      return { marginTop: m.top, marginBottom: m.bottom };
    }
    case "heading": {
      const key = `h${item.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const m = style.margins[key];
      return { marginTop: m.top, marginBottom: m.bottom };
    }
    case "list-item": {
      const listConfig = item.listType === "bullet"
        ? style.bulletList
        : style.numberedList;
      const listMargins = style.margins.list;

      return {
        marginTop: item.isFirstInList ? listMargins.top : listMargins.gap,
        marginBottom: item.isLastInList ? listMargins.bottom : listMargins.gap,
      };
    }
    case "blockquote": {
      const m = style.margins.blockquote;
      return { marginTop: m.top, marginBottom: m.bottom };
    }
    case "horizontal-rule": {
      const m = style.margins.horizontalRule;
      return { marginTop: m.top, marginBottom: m.bottom };
    }
    case "code-block": {
      const m = style.margins.code;
      return { marginTop: m.top, marginBottom: m.bottom };
    }
    case "math-block": {
      const m = style.margins.paragraph;
      return { marginTop: m.top, marginBottom: m.bottom };
    }
  }
}

function measureItem(
  rc: RenderContext,
  item: ParsedMarkdownItem,
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownItem {
  switch (item.type) {
    case "paragraph":
      return measureParagraph(rc, item, x, y, maxWidth, style);
    case "heading":
      return measureHeading(rc, item, x, y, maxWidth, style);
    case "list-item":
      return measureListItem(rc, item, x, y, maxWidth, style);
    case "blockquote":
      return measureBlockquote(rc, item, x, y, maxWidth, style);
    case "horizontal-rule":
      return measureHorizontalRule(x, y, maxWidth, style);
    case "code-block":
      return measureCodeBlock(rc, item, x, y, maxWidth, style);
    case "math-block":
      return measureMathBlock(rc, item, x, y, maxWidth, style);
  }
}

function measureParagraph(
  rc: RenderContext,
  item: { type: "paragraph"; content: MarkdownInline[] },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownParagraph {
  const textInfo = style.text.paragraph;
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    maxWidth,
    "left",
    style.link.color,
    style.link.underline,
  );

  const contentHeight = mFormattedText.dims.h();

  return {
    type: "paragraph",
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: contentHeight }),
    mFormattedText,
    position: new Coordinates({ x, y }),
  };
}

function measureHeading(
  rc: RenderContext,
  item: {
    type: "heading";
    level: 1 | 2 | 3 | 4 | 5 | 6;
    content: MarkdownInline[];
  },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownHeading {
  const levelKey = `h${item.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const textInfo = style.text[levelKey];
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    maxWidth,
    "left",
    style.link.color,
    style.link.underline,
  );

  const contentHeight = mFormattedText.dims.h();

  return {
    type: "heading",
    level: item.level,
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: contentHeight }),
    mFormattedText,
    position: new Coordinates({ x, y }),
  };
}

function measureListItem(
  rc: RenderContext,
  item: {
    type: "list-item";
    listType: "bullet" | "numbered";
    level: 0 | 1 | 2;
    listIndex?: number;
    content: MarkdownInline[];
  },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownListItem {
  const listConfig = item.listType === "bullet"
    ? style.bulletList
    : style.numberedList;
  const textInfo = style.text.list;

  const levelConfig = item.level === 0
    ? listConfig.level0
    : item.level === 1
    ? listConfig.level1
    : listConfig.level2;

  const markerText = item.listType === "numbered"
    ? `${item.listIndex ?? 1}${levelConfig.marker}`
    : levelConfig.marker;

  const mMarkerText = rc.mText(markerText, textInfo, 99999);

  const contentX = x + levelConfig.textIndent;
  const contentWidth = maxWidth - levelConfig.textIndent;
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    contentWidth,
    "left",
    style.link.color,
    style.link.underline,
  );

  const contentHeight = mFormattedText.dims.h();

  return {
    type: "list-item",
    listType: item.listType,
    level: item.level,
    listIndex: item.listIndex,
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: contentHeight }),
    marker: {
      mText: mMarkerText,
      position: new Coordinates({ x: x + levelConfig.markerIndent, y }),
    },
    content: {
      mFormattedText,
      position: new Coordinates({ x: contentX, y }),
    },
  };
}

function measureBlockquote(
  rc: RenderContext,
  item: { type: "blockquote"; content: MarkdownInline[] },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownBlockquote {
  const bqStyle = style.blockquote;
  const textInfo = style.text.blockquote;

  const contentX = x + bqStyle.leftBorderWidth + bqStyle.paddingLeft;
  const contentStartY = y + bqStyle.paddingTop;
  const contentWidth = maxWidth - bqStyle.leftBorderWidth -
    bqStyle.paddingLeft -
    bqStyle.paddingRight;

  // Split content into paragraphs at double-break boundaries
  const contentGroups: MarkdownInline[][] = [];
  let currentGroup: MarkdownInline[] = [];
  let consecutiveBreaks = 0;

  for (const inline of item.content) {
    if (inline.type === "break") {
      consecutiveBreaks++;
      if (consecutiveBreaks >= 2) {
        if (currentGroup.length > 0) {
          contentGroups.push(currentGroup);
          currentGroup = [];
        }
        consecutiveBreaks = 0;
      }
    } else {
      while (consecutiveBreaks > 0) {
        currentGroup.push({ type: "break" });
        consecutiveBreaks--;
      }
      currentGroup.push(inline);
    }
  }
  if (currentGroup.length > 0) {
    contentGroups.push(currentGroup);
  }

  // Measure each paragraph
  const measuredParagraphs: {
    mFormattedText: ReturnType<typeof measureFormattedText>;
    position: Coordinates;
  }[] = [];
  let currentY = contentStartY;

  for (let i = 0; i < contentGroups.length; i++) {
    if (i > 0) {
      currentY += bqStyle.paragraphGap;
    }

    const formattedText = inlinesToFormattedText(contentGroups[i], textInfo);
    const mFormattedText = measureFormattedText(
      rc,
      formattedText,
      contentWidth,
      bqStyle.align,
      style.link.color,
      style.link.underline,
    );

    measuredParagraphs.push({
      mFormattedText,
      position: new Coordinates({ x: contentX, y: currentY }),
    });

    currentY += mFormattedText.dims.h();
  }

  const textHeight = currentY - contentStartY;
  const totalHeight = bqStyle.paddingTop + textHeight + bqStyle.paddingBottom;
  const borderX = x + bqStyle.leftBorderWidth / 2;

  return {
    type: "blockquote",
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: totalHeight }),
    border: {
      line: {
        start: new Coordinates({ x: borderX, y }),
        end: new Coordinates({ x: borderX, y: y + totalHeight }),
      },
      style: {
        strokeColor: bqStyle.leftBorderColor,
        strokeWidth: bqStyle.leftBorderWidth,
      },
    },
    background: bqStyle.backgroundColor !== "none"
      ? {
        rcd: new RectCoordsDims({
          x,
          y,
          w: maxWidth,
          h: totalHeight,
        }),
        color: bqStyle.backgroundColor,
      }
      : undefined,
    paragraphs: measuredParagraphs,
  };
}

function measureHorizontalRule(
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownHorizontalRule {
  const hrStyle = style.horizontalRule;
  const contentHeight = hrStyle.strokeWidth;
  const lineY = y + hrStyle.strokeWidth / 2;

  return {
    type: "horizontal-rule",
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: contentHeight }),
    line: {
      start: new Coordinates({ x, y: lineY }),
      end: new Coordinates({ x: x + maxWidth, y: lineY }),
    },
    style: {
      strokeWidth: hrStyle.strokeWidth,
      strokeColor: hrStyle.strokeColor,
      lineDash: "solid",
      show: true,
    },
  };
}

function measureCodeBlock(
  rc: RenderContext,
  item: { type: "code-block"; code: string },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownCodeBlock {
  const codeStyle = style.code;
  const textInfo = style.text.code;
  const paddingH = codeStyle.paddingHorizontal;
  const paddingV = codeStyle.paddingVertical;

  const codeLines = item.code.split("\n");
  if (codeLines.length > 0 && codeLines[codeLines.length - 1] === "") {
    codeLines.pop();
  }

  const contentX = x + paddingH;
  const contentY = y + paddingV;
  const contentWidth = maxWidth - paddingH * 2;
  const lineHeight = textInfo.fontSize * textInfo.lineHeight;

  const measuredLines: {
    mText: import("../deps.ts").MeasuredText;
    y: number;
  }[] = [];

  for (let i = 0; i < codeLines.length; i++) {
    const displayLine = codeLines[i] || " ";
    const mText = rc.mText(displayLine, textInfo, contentWidth);
    measuredLines.push({ mText, y: i * lineHeight });
  }

  const lastLine = measuredLines[measuredLines.length - 1];
  const textHeight = lastLine ? lastLine.y + lastLine.mText.dims.h() : 0;
  const totalHeight = textHeight + paddingV * 2;

  return {
    type: "code-block",
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: totalHeight }),
    background: {
      rcd: new RectCoordsDims({ x, y, w: maxWidth, h: totalHeight }),
      color: codeStyle.backgroundColor,
    },
    lines: measuredLines,
    contentPosition: new Coordinates({ x: contentX, y: contentY }),
  };
}

function measureMathBlock(
  rc: RenderContext,
  item: { type: "math-block"; latex: string },
  x: number,
  y: number,
  maxWidth: number,
  style: MergedMarkdownStyle,
): MeasuredMarkdownParagraph {
  const textInfo = style.text.paragraph;
  const formattedText: FormattedText = {
    runs: [{ text: `[Math: ${item.latex}]`, style: "italic" }],
    baseStyle: textInfo,
  };
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    maxWidth,
    "center",
    style.link.color,
    style.link.underline,
  );

  return {
    type: "paragraph",
    bounds: new RectCoordsDims({
      x,
      y,
      w: maxWidth,
      h: mFormattedText.dims.h(),
    }),
    mFormattedText,
    position: new Coordinates({ x, y }),
  };
}

function inlinesToFormattedText(
  inlines: MarkdownInline[],
  baseTextInfo: import("../deps.ts").TextInfoUnkeyed,
): FormattedText {
  const runs: FormattedRun[] = [];

  for (const inline of inlines) {
    switch (inline.type) {
      case "text":
        runs.push({ text: inline.text, style: "normal" });
        break;
      case "bold":
        runs.push({ text: inline.text, style: "bold" });
        break;
      case "italic":
        runs.push({ text: inline.text, style: "italic" });
        break;
      case "bold-italic":
        runs.push({ text: inline.text, style: "bold-italic" });
        break;
      case "link":
        runs.push({
          text: inline.text,
          style: "normal",
          link: { url: inline.url },
        });
        break;
      case "break":
        runs.push({ text: "\n", style: "normal" });
        break;
      case "code-inline":
        runs.push({ text: inline.text, style: "normal", isCode: true });
        break;
      case "math-inline":
        runs.push({ text: `[${inline.latex}]`, style: "italic" });
        break;
    }
  }

  return { runs, baseStyle: baseTextInfo };
}
