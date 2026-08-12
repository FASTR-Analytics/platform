// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { MarkdownIt } from "./deps.ts";
import type {
  MarkdownInline,
  MarkdownItToken,
  ParsedMarkdown,
  ParsedMarkdownItem,
} from "./types.ts";

export function createMarkdownIt(options?: { html?: boolean }): MarkdownIt {
  const md = new MarkdownIt({
    breaks: true,
    // html:false by default so raw HTML is escaped, not injected — callers
    // rendering to innerHTML must opt in explicitly for trusted content only.
    html: options?.html ?? false,
    linkify: false,
    // Curly (typographic) quotes and apostrophes. We keep ONLY the smart-quote
    // substitutions; the line below disables markdown-it's other typographer
    // replacements (en/em dashes, ellipsis, (c)/(tm), and so on), so prose is
    // untouched apart from straight quotes becoming curly.
    typographer: true,
  });
  md.disable("replacements", true);
  // TODO: Fix katex plugin loading issue
  // md.use(markdownItKatex);
  return md;
}

export function parseMarkdown(markdownContent: string): ParsedMarkdown {
  // html:true is safe here: this token stream feeds the IR (canvas/PDF/Word),
  // which only consumes the explicitly handled tokens (e.g. <br>) and drops
  // the rest — nothing is ever passed through to an HTML sink.
  const md = createMarkdownIt({ html: true });

  const tokens = md.parse(markdownContent, {});
  const items: ParsedMarkdownItem[] = [];

  let listCounter = 0;
  let inNumberedList = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    // 0-based start line of this block (markdown-it provides it on block tokens).
    const line = token.map?.[0];

    if (token.type === "hr") {
      items.push({ type: "horizontal-rule", line });
    } else if (token.type === "fence") {
      items.push({ type: "code-block", code: token.content ?? "", line });
    } else if (token.type === "math_block") {
      items.push({ type: "math-block", latex: token.content ?? "", line });
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
      items.push({ type: "blockquote", content, line });
      i = j;
    } else if (token.type === "heading_open") {
      const level = parseInt(token.tag.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      const contentToken = tokens[i + 1];

      if (contentToken && contentToken.type === "inline") {
        items.push({
          type: "heading",
          level,
          content: parseInlineTokens(contentToken.children || []),
          line,
        });
      }
      i += 2;
    } else if (token.type === "table_open") {
      const tableResult = parseTable(tokens, i);
      items.push({ ...tableResult.item, line });
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
            line,
          });
        } else {
          items.push({
            type: "paragraph",
            content: parseInlineTokens(children),
            line,
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
            line,
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
      for (const seg of result.segments) {
        content.push(
          emphasizedInline(seg, seg.italic ? "bold-italic" : "bold"),
        );
      }
      i = result.endIndex + 1;
    } else if (token.type === "em_open") {
      const result = parseNestedInline(tokens, i + 1, "em_close");
      for (const seg of result.segments) {
        content.push(
          emphasizedInline(seg, seg.bold ? "bold-italic" : "italic"),
        );
      }
      i = result.endIndex + 1;
    } else if (token.type === "link_open") {
      const href = token.attrs?.find(
        (attr: [string, string]) => attr[0] === "href",
      )?.[1];
      const result = parseNestedInline(tokens, i + 1, "link_close");
      for (const seg of result.segments) {
        content.push({
          type: "link",
          text: seg.text,
          url: href || "",
          style: segmentStyle(seg),
        });
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

// Emphasis is tracked PER SEGMENT, not per run: in `**bold with *em* more**`
// only the middle segment is bold-italic, and the two around it are plain bold.
// (Run-level flags used to promote the whole run to the strongest emphasis any
// part of it carried.) The same segments give a link its inner formatting.
type NestedInlineSegment = {
  text: string;
  bold: boolean;
  italic: boolean;
  // Set when the segment came from a link nested inside the emphasis
  // (`**see [here](url) now**`). Emphasis wins the inline's shape only when the
  // segment carries no URL — a link must stay a link, or its href is lost.
  url?: string;
};

type NestedInlineResult = {
  segments: NestedInlineSegment[];
  endIndex: number;
};

function segmentStyle(
  seg: NestedInlineSegment,
): "bold" | "italic" | "bold-italic" | undefined {
  if (seg.bold && seg.italic) {
    return "bold-italic";
  }
  if (seg.bold) {
    return "bold";
  }
  if (seg.italic) {
    return "italic";
  }
  return undefined;
}

function emphasizedInline(
  seg: NestedInlineSegment,
  style: "bold" | "italic" | "bold-italic",
): MarkdownInline {
  if (seg.url !== undefined) {
    return { type: "link", text: seg.text, url: seg.url, style };
  }
  return { type: style, text: seg.text };
}

function parseNestedInline(
  tokens: MarkdownItToken[],
  startIndex: number,
  closeType: string,
): NestedInlineResult {
  const segments: NestedInlineSegment[] = [];
  let i = startIndex;

  while (i < tokens.length && tokens[i].type !== closeType) {
    const token = tokens[i];

    if (token.type === "text" && token.content) {
      segments.push({ text: token.content, bold: false, italic: false });
      i++;
    } else if (token.type === "strong_open") {
      const result = parseNestedInline(tokens, i + 1, "strong_close");
      for (const seg of result.segments) {
        segments.push({ ...seg, bold: true });
      }
      i = result.endIndex + 1;
    } else if (token.type === "em_open") {
      const result = parseNestedInline(tokens, i + 1, "em_close");
      for (const seg of result.segments) {
        segments.push({ ...seg, italic: true });
      }
      i = result.endIndex + 1;
    } else if (token.type === "link_open") {
      // A link nested inside emphasis. Without this branch the link_open token
      // fell through to the skip below and only its inner text survived, so
      // `**see [here](url) now**` silently lost its href.
      const href = token.attrs?.find(
        (attr: [string, string]) => attr[0] === "href",
      )?.[1];
      const result = parseNestedInline(tokens, i + 1, "link_close");
      for (const seg of result.segments) {
        segments.push({ ...seg, url: href || "" });
      }
      i = result.endIndex + 1;
    } else if (token.type === "softbreak" || token.type === "hardbreak") {
      segments.push({ text: "\n", bold: false, italic: false });
      i++;
    } else {
      i++;
    }
  }

  return { segments, endIndex: i };
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
