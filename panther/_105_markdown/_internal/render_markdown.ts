// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { RenderContext } from "../deps.ts";
import type {
  MeasuredMarkdown,
  MeasuredMarkdownBlockquote,
  MeasuredMarkdownHeading,
  MeasuredMarkdownHorizontalRule,
  MeasuredMarkdownItem,
  MeasuredMarkdownListItem,
  MeasuredMarkdownParagraph,
} from "../types.ts";
import { renderFormattedText } from "./formatted_text.ts";

export function renderMarkdown(
  rc: RenderContext,
  measured: MeasuredMarkdown,
): void {
  for (const item of measured.markdownItems) {
    renderItem(rc, item);
  }
}

function renderItem(rc: RenderContext, item: MeasuredMarkdownItem): void {
  switch (item.type) {
    case "paragraph":
      renderParagraph(rc, item);
      break;
    case "heading":
      renderHeading(rc, item);
      break;
    case "list-item":
      renderListItem(rc, item);
      break;
    case "blockquote":
      renderBlockquote(rc, item);
      break;
    case "horizontal-rule":
      renderHorizontalRule(rc, item);
      break;
  }
}

function renderParagraph(
  rc: RenderContext,
  item: MeasuredMarkdownParagraph,
): void {
  renderFormattedText(rc, item.mFormattedText, item.position);
}

function renderHeading(rc: RenderContext, item: MeasuredMarkdownHeading): void {
  renderFormattedText(rc, item.mFormattedText, item.position);
}

function renderListItem(
  rc: RenderContext,
  item: MeasuredMarkdownListItem,
): void {
  rc.rText(item.marker.mText, item.marker.position, "left", "top");
  renderFormattedText(rc, item.content.mFormattedText, item.content.position);
}

function renderBlockquote(
  rc: RenderContext,
  item: MeasuredMarkdownBlockquote,
): void {
  if (item.background) {
    rc.rRect(item.background.rcd, {
      fillColor: item.background.color,
      show: true,
    });
  }

  rc.rLine([item.border.line.start, item.border.line.end], {
    strokeWidth: item.border.style.strokeWidth,
    strokeColor: item.border.style.strokeColor,
    lineDash: "solid",
    show: true,
  });

  renderFormattedText(rc, item.mFormattedText, item.position);
}

function renderHorizontalRule(
  rc: RenderContext,
  item: MeasuredMarkdownHorizontalRule,
): void {
  rc.rLine([item.line.start, item.line.end], item.style);
}
