// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Coordinates,
  getColor,
  type MarkdownStyleConfig,
  RectCoordsDims,
  type RenderContext,
} from "../deps.ts";
import type {
  FormattedRun,
  FormattedText,
  MarkdownInline,
  MeasuredMarkdownBlockquote,
  MeasuredMarkdownHeading,
  MeasuredMarkdownHorizontalRule,
  MeasuredMarkdownItem,
  MeasuredMarkdownListItem,
  MeasuredMarkdownParagraph,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "../types.ts";
import { measureFormattedText } from "./formatted_text.ts";
import { markdownTextStyleToTextInfo } from "./style_to_canvas.ts";

export type MeasuredMarkdownItemsResult = {
  bounds: RectCoordsDims;
  items: MeasuredMarkdownItem[];
};

export function measureMarkdownItems(
  rc: RenderContext,
  bounds: RectCoordsDims,
  parsed: ParsedMarkdown,
  style: MarkdownStyleConfig,
): MeasuredMarkdownItemsResult {
  const items: MeasuredMarkdownItem[] = [];
  let currentY = bounds.y();
  const maxWidth = bounds.w();
  let prevMarginBottom = 0;

  for (let i = 0; i < parsed.items.length; i++) {
    const parsedItem = parsed.items[i];
    const margins = getItemMargins(parsedItem, style);
    const isFirst = i === 0;

    // Calculate gap: first item has no top gap, others use max(prev bottom, curr top)
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

  // Add last item's bottom margin to total height
  const totalHeight = currentY - bounds.y() + prevMarginBottom;

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
  style: MarkdownStyleConfig,
): ItemMargins {
  switch (item.type) {
    case "paragraph": {
      const s = style.paragraph;
      return { marginTop: s.marginTop ?? 0, marginBottom: s.marginBottom ?? 0 };
    }
    case "heading": {
      const key = `h${item.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      const s = style[key];
      return { marginTop: s.marginTop ?? 0, marginBottom: s.marginBottom ?? 0 };
    }
    case "list-item": {
      return {
        marginTop: style.spacing.listItemGap,
        marginBottom: style.spacing.listItemGap,
      };
    }
    case "blockquote": {
      const s = style.blockquote.text;
      return { marginTop: s.marginTop ?? 0, marginBottom: s.marginBottom ?? 0 };
    }
    case "horizontal-rule": {
      const s = style.horizontalRule;
      return { marginTop: s.marginTop, marginBottom: s.marginBottom };
    }
  }
}

function measureItem(
  rc: RenderContext,
  item: ParsedMarkdownItem,
  x: number,
  y: number,
  maxWidth: number,
  style: MarkdownStyleConfig,
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
  }
}

function measureParagraph(
  rc: RenderContext,
  item: { type: "paragraph"; content: MarkdownInline[] },
  x: number,
  y: number,
  maxWidth: number,
  style: MarkdownStyleConfig,
): MeasuredMarkdownParagraph {
  const textStyle = style.paragraph;
  const align = textStyle.align ?? "left";

  const textInfo = markdownTextStyleToTextInfo(textStyle);
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    maxWidth,
    align,
    getColor(style.link.color),
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
  style: MarkdownStyleConfig,
): MeasuredMarkdownHeading {
  const levelKey = `h${item.level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
  const textStyle = style[levelKey];
  const align = textStyle.align ?? "left";

  const textInfo = markdownTextStyleToTextInfo(textStyle);
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    maxWidth,
    align,
    getColor(style.link.color),
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
  style: MarkdownStyleConfig,
): MeasuredMarkdownListItem {
  const listStyle = item.listType === "bullet"
    ? style.bulletList
    : style.numberedList;
  const textStyle = listStyle.text;

  const levelConfig = item.level === 0
    ? listStyle.level0
    : item.level === 1
    ? listStyle.level1
    : listStyle.level2;

  const markerText = item.listType === "numbered"
    ? `${item.listIndex ?? 1}${levelConfig.marker}`
    : levelConfig.marker;

  const textInfo = markdownTextStyleToTextInfo(textStyle);
  const mMarkerText = rc.mText(markerText, textInfo, 99999);

  const contentX = x + levelConfig.textIndent;
  const contentWidth = maxWidth - levelConfig.textIndent;
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    contentWidth,
    "left",
    getColor(style.link.color),
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
  style: MarkdownStyleConfig,
): MeasuredMarkdownBlockquote {
  const bqStyle = style.blockquote;
  const textStyle = bqStyle.text;

  const contentX = x + bqStyle.leftBorderWidth + bqStyle.leftIndent;
  const contentWidth = maxWidth - bqStyle.leftBorderWidth - bqStyle.leftIndent;

  const textInfo = markdownTextStyleToTextInfo(textStyle);
  const formattedText = inlinesToFormattedText(item.content, textInfo);
  const mFormattedText = measureFormattedText(
    rc,
    formattedText,
    contentWidth,
    "left",
    getColor(style.link.color),
    style.link.underline,
  );

  const contentHeight = mFormattedText.dims.h();
  const borderX = x + bqStyle.leftBorderWidth / 2;

  return {
    type: "blockquote",
    bounds: new RectCoordsDims({ x, y, w: maxWidth, h: contentHeight }),
    border: {
      line: {
        start: new Coordinates({ x: borderX, y }),
        end: new Coordinates({ x: borderX, y: y + contentHeight }),
      },
      style: {
        strokeColor: getColor(bqStyle.leftBorderColor),
        strokeWidth: bqStyle.leftBorderWidth,
      },
    },
    background: bqStyle.backgroundColor
      ? {
        rcd: new RectCoordsDims({
          x,
          y,
          w: maxWidth,
          h: contentHeight,
        }),
        color: getColor(bqStyle.backgroundColor),
      }
      : undefined,
    mFormattedText,
    position: new Coordinates({ x: contentX, y }),
  };
}

function measureHorizontalRule(
  x: number,
  y: number,
  maxWidth: number,
  style: MarkdownStyleConfig,
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
      strokeColor: getColor(hrStyle.strokeColor),
      lineDash: "solid",
      show: true,
    },
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
    }
  }

  return { runs, baseStyle: baseTextInfo };
}
