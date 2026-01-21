// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { MarkdownIt, markdownItKatex } from "./deps.ts";
import type {
  MarkdownInline,
  MarkdownItToken,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "./types.ts";

export function createMarkdownIt(): MarkdownIt {
  const md = new MarkdownIt({
    breaks: true,
    html: true,
    linkify: false,
  });
  // TODO: Fix katex plugin loading issue
  // md.use(markdownItKatex);
  return md;
}

export function parseMarkdown(markdownContent: string): ParsedMarkdown {
  const md = createMarkdownIt();

  const tokens = md.parse(markdownContent, {});
  const items: ParsedMarkdownItem[] = [];

  let listCounter = 0;
  let inNumberedList = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "hr") {
      items.push({ type: "horizontal-rule" });
    } else if (token.type === "fence") {
      items.push({ type: "code-block", code: token.content ?? "" });
    } else if (token.type === "math_block") {
      items.push({ type: "math-block", latex: token.content ?? "" });
    } else if (token.type === "blockquote_open") {
      const content: MarkdownInline[] = [];
      let j = i + 1;
      let paragraphCount = 0;
      while (j < tokens.length && tokens[j].type !== "blockquote_close") {
        if (tokens[j].type === "paragraph_open") {
          if (paragraphCount > 0) {
            // Add double break between paragraphs
            content.push({ type: "break" });
            content.push({ type: "break" });
          }
          paragraphCount++;
        } else if (tokens[j].type === "inline") {
          content.push(...parseInlineTokens(tokens[j].children || []));
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
    } else if (token.type === "table_open") {
      const tableResult = parseTable(tokens, i);
      items.push(tableResult.item);
      i = tableResult.endIndex;
    } else if (token.type === "paragraph_open" && token.level === 0) {
      const contentToken = tokens[i + 1];

      if (contentToken && contentToken.type === "inline") {
        // Check if this paragraph contains only a single image
        const children = contentToken.children || [];
        if (children.length === 1 && children[0].type === "image") {
          const imageToken = children[0];
          const src = imageToken.attrs?.find((a: [string, string]) =>
            a[0] === "src"
          )?.[1] || "";
          const alt = imageToken.content || "";
          items.push({
            type: "image",
            src,
            alt,
          });
        } else {
          items.push({
            type: "paragraph",
            content: parseInlineTokens(children),
          });
        }
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
            isFirstInList: false,
            isLastInList: false,
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

  markFirstAndLastListItems(items);

  return { items };
}

function markFirstAndLastListItems(items: ParsedMarkdownItem[]): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.type !== "list-item") continue;

    const prevItem = items[i - 1];
    const nextItem = items[i + 1];

    const prevIsListItem = prevItem?.type === "list-item" &&
      prevItem.listType === item.listType;
    const nextIsListItem = nextItem?.type === "list-item" &&
      nextItem.listType === item.listType;

    item.isFirstInList = !prevIsListItem;
    item.isLastInList = !nextIsListItem;
  }
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
    } else if (
      token.type === "html_inline" &&
      (token.content === "<br>" || token.content === "<br/>")
    ) {
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
      content.push({ type: "code-inline", text: token.content });
      i++;
    } else if (token.type === "math_inline" && token.content) {
      content.push({ type: "math-inline", latex: token.content });
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

function parseTable(
  tokens: MarkdownItToken[],
  startIndex: number,
): { item: ParsedMarkdownItem; endIndex: number } {
  const header: MarkdownInline[][][] = [];
  const rows: MarkdownInline[][][] = [];
  let currentTarget: MarkdownInline[][][] | undefined;
  let i = startIndex + 1; // Skip table_open

  while (i < tokens.length && tokens[i].type !== "table_close") {
    const token = tokens[i];

    if (token.type === "thead_open") {
      currentTarget = header;
    } else if (token.type === "tbody_open") {
      currentTarget = rows;
    } else if (token.type === "tr_open" && currentTarget !== undefined) {
      const rowCells: MarkdownInline[][] = [];

      i++;
      while (i < tokens.length && tokens[i].type !== "tr_close") {
        if (tokens[i].type === "th_open" || tokens[i].type === "td_open") {
          i++;
          if (i < tokens.length && tokens[i].type === "inline") {
            const cellContent = parseInlineTokens(tokens[i].children || []);
            rowCells.push(cellContent);
          }
          i++; // Skip th_close or td_close
        } else {
          i++;
        }
      }

      currentTarget.push(rowCells);
    }

    i++;
  }

  return {
    item: {
      type: "table",
      header: header.length > 0 ? header : undefined,
      rows: rows.length > 0 ? rows : undefined,
    },
    endIndex: i,
  };
}

export function parseEmailsInText(text: string): MarkdownInline[] {
  const emailRegex = /<([^>]+@[^>]+)>/g;
  const parts: MarkdownInline[] = [];
  let lastIndex = 0;
  let match;

  while ((match = emailRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: text.substring(lastIndex, match.index),
      });
    }

    parts.push({
      type: "link",
      text: match[1],
      url: `mailto:${match[1]}`,
    });

    lastIndex = emailRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      text: text.substring(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}
