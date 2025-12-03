// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { MarkdownIt } from "./deps.ts";
import type {
  MarkdownInline,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "./types.ts";

export function parseMarkdown(markdownContent: string): ParsedMarkdown {
  const md = new MarkdownIt({
    breaks: true,
    html: false,
    linkify: false,
  });

  const tokens = md.parse(markdownContent, {});
  const items: ParsedMarkdownItem[] = [];

  let listCounter = 0;
  let inNumberedList = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "hr") {
      items.push({ type: "horizontal-rule" });
    } else if (token.type === "blockquote_open") {
      const content: MarkdownInline[] = [];
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "blockquote_close") {
        if (tokens[j].type === "inline") {
          content.push(...parseInlineTokens(tokens[j].children || []));
          if (
            j + 1 < tokens.length &&
            tokens[j + 1].type !== "blockquote_close" &&
            tokens[j + 1].type !== "paragraph_close"
          ) {
            content.push({ type: "break" });
          }
        }
        j++;
      }
      items.push({ type: "blockquote", content });
      i = j;
    } else if (token.type === "heading_open") {
      const level = parseInt(token.tag.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      const contentToken = tokens[i + 1];

      if (contentToken && contentToken.type === "inline") {
        items.push({
          type: "heading",
          level,
          content: parseInlineTokens(contentToken.children || []),
        });
      }
      i += 2;
    } else if (token.type === "paragraph_open" && token.level === 0) {
      const contentToken = tokens[i + 1];

      if (contentToken && contentToken.type === "inline") {
        items.push({
          type: "paragraph",
          content: parseInlineTokens(contentToken.children || []),
        });
      }
      i += 2;
      inNumberedList = false;
      listCounter = 0;
    } else if (token.type === "bullet_list_open") {
      inNumberedList = false;
      listCounter = 0;
    } else if (token.type === "ordered_list_open") {
      inNumberedList = true;
      listCounter = 0;
    } else if (token.type === "list_item_open") {
      const listLevel = Math.floor((token.level - 1) / 2) as 0 | 1 | 2;

      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "list_item_close") {
        if (tokens[j].type === "inline") {
          const item: ParsedMarkdownItem = {
            type: "list-item",
            listType: inNumberedList ? "numbered" : "bullet",
            level: listLevel,
            content: parseInlineTokens(tokens[j].children || []),
          };

          if (inNumberedList) {
            listCounter++;
            item.listIndex = listCounter;
          }

          items.push(item);
          break;
        }
        j++;
      }
    }
  }

  return { items };
}

function parseInlineTokens(tokens: MarkdownItToken[]): MarkdownInline[] {
  const content: MarkdownInline[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === "text" && token.content) {
      content.push({ type: "text", text: token.content });
      i++;
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      content.push({ type: "break" });
      i++;
    } else if (token.type === "strong_open") {
      const result = parseNestedInline(tokens, i + 1, "strong_close");
      if (result.hasItalic) {
        for (const text of result.texts) {
          content.push({ type: "bold-italic", text });
        }
      } else {
        for (const text of result.texts) {
          content.push({ type: "bold", text });
        }
      }
      i = result.endIndex + 1;
    } else if (token.type === "em_open") {
      const result = parseNestedInline(tokens, i + 1, "em_close");
      if (result.hasBold) {
        for (const text of result.texts) {
          content.push({ type: "bold-italic", text });
        }
      } else {
        for (const text of result.texts) {
          content.push({ type: "italic", text });
        }
      }
      i = result.endIndex + 1;
    } else if (token.type === "link_open") {
      const href = token.attrs?.find(
        (attr: [string, string]) => attr[0] === "href",
      )?.[1];
      const result = parseNestedInline(tokens, i + 1, "link_close");
      for (const text of result.texts) {
        content.push({ type: "link", text, url: href || "" });
      }
      i = result.endIndex + 1;
    } else if (token.type === "code_inline" && token.content) {
      content.push({ type: "text", text: token.content });
      i++;
    } else {
      i++;
    }
  }

  return content;
}

type NestedInlineResult = {
  texts: string[];
  hasBold: boolean;
  hasItalic: boolean;
  endIndex: number;
};

function parseNestedInline(
  tokens: MarkdownItToken[],
  startIndex: number,
  closeType: string,
): NestedInlineResult {
  const texts: string[] = [];
  let hasBold = false;
  let hasItalic = false;
  let i = startIndex;

  while (i < tokens.length && tokens[i].type !== closeType) {
    const token = tokens[i];

    if (token.type === "text" && token.content) {
      texts.push(token.content);
      i++;
    } else if (token.type === "strong_open") {
      hasBold = true;
      const result = parseNestedInline(tokens, i + 1, "strong_close");
      texts.push(...result.texts);
      i = result.endIndex + 1;
    } else if (token.type === "em_open") {
      hasItalic = true;
      const result = parseNestedInline(tokens, i + 1, "em_close");
      texts.push(...result.texts);
      i = result.endIndex + 1;
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      texts.push("\n");
      i++;
    } else {
      i++;
    }
  }

  return { texts, hasBold, hasItalic, endIndex: i };
}

type MarkdownItToken = {
  type: string;
  tag?: string;
  level?: number;
  content?: string;
  children?: MarkdownItToken[];
  attrs?: [string, string][];
};
