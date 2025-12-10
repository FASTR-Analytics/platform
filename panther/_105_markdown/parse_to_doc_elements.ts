// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMarkdownIt } from "./parser.ts";
import type {
  DocElement,
  InlineContent,
  ParsedDocument,
} from "./doc_element_types.ts";
import type { MarkdownItToken } from "./types.ts";

export function parseMarkdown(markdownContent: string): ParsedDocument {
  const md = createMarkdownIt();
  const tokens = md.parse(markdownContent, {});
  const elements: DocElement[] = [];

  let listCounter = 0;
  let inNumberedList = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "hr") {
      elements.push({
        type: "horizontal-rule",
        content: [],
      });
    } else if (token.type === "blockquote_open") {
      const blockquoteContent: InlineContent[] = [];
      let j = i + 1;
      let paragraphCount = 0;
      while (j < tokens.length && tokens[j].type !== "blockquote_close") {
        if (tokens[j].type === "paragraph_open") {
          if (paragraphCount > 0) {
            // Add double break between paragraphs
            blockquoteContent.push({ type: "break", text: "" });
            blockquoteContent.push({ type: "break", text: "" });
          }
          paragraphCount++;
        } else if (tokens[j].type === "inline") {
          blockquoteContent.push(
            ...parseInlineTokens(tokens[j].children || []),
          );
        }
        j++;
      }
      elements.push({
        type: "blockquote",
        content: blockquoteContent,
      });
      i = j;
    } else if (token.type === "table_open") {
      const tableResult = parseTable(tokens, i);
      if (tableResult) {
        elements.push(tableResult.element);
        i = tableResult.endIndex;
      }
    } else if (token.type === "fence") {
      elements.push({
        type: "code-block",
        codeContent: token.content ?? "",
        content: [],
      });
    } else if (token.type === "math_block") {
      elements.push({
        type: "math-block",
        mathLatex: token.content ?? "",
        content: [],
      });
    } else if (token.type === "heading_open") {
      const level = parseInt(token.tag.substring(1)) as 1 | 2 | 3 | 4 | 5 | 6;
      const contentToken = tokens[i + 1];

      if (contentToken && contentToken.type === "inline") {
        elements.push({
          type: "heading",
          level,
          content: parseInlineTokens(contentToken.children || []),
        });
      }
      i += 2; // Skip inline and closing tokens
    } else if (token.type === "paragraph_open" && token.level === 0) {
      // Only process top-level paragraphs (not those inside list items)
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
          elements.push({
            type: "image",
            imageData: src,
            imageAlt: alt,
            content: [],
          });
        } else {
          elements.push({
            type: "paragraph",
            content: parseInlineTokens(children),
          });
        }
      }
      i += 2; // Skip inline and closing tokens
      inNumberedList = false;
      listCounter = 0;
    } else if (token.type === "bullet_list_open") {
      inNumberedList = false;
      listCounter = 0;
    } else if (token.type === "ordered_list_open") {
      inNumberedList = true;
      listCounter = 0;
    } else if (token.type === "list_item_open") {
      // Determine list level based on token.level
      // Level 1 = top level list, 3 = first nested, 5 = second nested
      const listLevel = Math.floor((token.level - 1) / 2) as 0 | 1 | 2;

      // Find the inline content within this list item
      let j = i + 1;
      while (j < tokens.length && tokens[j].type !== "list_item_close") {
        if (tokens[j].type === "inline") {
          const element: DocElement = {
            type: "list-item",
            listType: inNumberedList ? "numbered" : "bullet",
            listLevel: listLevel,
            isFirstInList: false,
            isLastInList: false,
            content: parseInlineTokens(tokens[j].children || []),
          };

          if (inNumberedList) {
            listCounter++;
            element.listIndex = listCounter;
          }

          elements.push(element);
          break;
        }
        j++;
      }
    }
  }

  markFirstAndLastListItems(elements);

  return { elements };
}

function markFirstAndLastListItems(elements: DocElement[]): void {
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    if (element.type !== "list-item") continue;

    const prevElement = elements[i - 1];
    const nextElement = elements[i + 1];

    const prevIsListItem = prevElement?.type === "list-item" &&
      prevElement.listType === element.listType;
    const nextIsListItem = nextElement?.type === "list-item" &&
      nextElement.listType === element.listType;

    element.isFirstInList = !prevIsListItem;
    element.isLastInList = !nextIsListItem;
  }
}

function parseInlineTokens(tokens: MarkdownItToken[]): InlineContent[] {
  const content: InlineContent[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === "text" && token.content) {
      content.push({
        type: "text",
        text: token.content,
      });
    } else if (token.type === "softbreak") {
      // With breaks:true, softbreaks should be treated as line breaks
      content.push({
        type: "break",
        text: "",
      });
    } else if (token.type === "hardbreak") {
      content.push({
        type: "break",
        text: "",
      });
    } else if (
      token.type === "html_inline" &&
      (token.content === "<br>" || token.content === "<br/>")
    ) {
      content.push({
        type: "break",
        text: "",
      });
    } else if (token.type === "strong_open") {
      // Find the text within bold tags
      i++;
      if (i < tokens.length && tokens[i].type === "text") {
        content.push({
          type: "bold",
          text: tokens[i].content ?? "",
        });
        i++; // Skip the strong_close token
      }
    } else if (token.type === "em_open") {
      // Find the text within italic tags
      i++;
      if (i < tokens.length && tokens[i].type === "text") {
        content.push({
          type: "italic",
          text: tokens[i].content ?? "",
        });
        i++; // Skip the em_close token
      }
    } else if (token.type === "link_open") {
      const href = token.attrs?.find(
        (attr: [string, string]) => attr[0] === "href",
      )?.[1];
      i++;
      if (i < tokens.length && tokens[i].type === "text") {
        content.push({
          type: "link",
          text: tokens[i].content ?? "",
          url: href || "",
        });
        i++; // Skip the link_close token
      }
    } else if (token.type === "code_inline") {
      content.push({
        type: "code-inline",
        text: token.content ?? "",
      });
    } else if (token.type === "math_inline") {
      content.push({
        type: "math-inline",
        text: token.content ?? "",
      });
    }
  }

  return content;
}

export function parseEmailsInText(text: string): InlineContent[] {
  const emailRegex = /<([^>]+@[^>]+)>/g;
  const parts: InlineContent[] = [];
  let lastIndex = 0;
  let match;

  while ((match = emailRegex.exec(text)) !== null) {
    // Add text before email
    if (match.index > lastIndex) {
      parts.push({
        type: "text",
        text: text.substring(lastIndex, match.index),
      });
    }

    // Add email
    parts.push({
      type: "email",
      text: match[1],
      url: `mailto:${match[1]}`,
    });

    lastIndex = emailRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push({
      type: "text",
      text: text.substring(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: "text", text }];
}

function parseTable(
  tokens: MarkdownItToken[],
  startIndex: number,
): { element: DocElement; endIndex: number } | undefined {
  const tableHeader: InlineContent[][][] = [];
  const tableRows: InlineContent[][][] = [];
  let currentRow: InlineContent[][][] | undefined;
  let i = startIndex + 1; // Skip table_open

  while (i < tokens.length && tokens[i].type !== "table_close") {
    const token = tokens[i];

    if (token.type === "thead_open") {
      currentRow = tableHeader;
    } else if (token.type === "tbody_open") {
      currentRow = tableRows;
    } else if (token.type === "tr_open" && currentRow !== undefined) {
      // Start a new row - this row will contain multiple cells
      const rowCells: InlineContent[][] = [];

      // Find all cells in this row
      i++;
      while (i < tokens.length && tokens[i].type !== "tr_close") {
        if (tokens[i].type === "th_open" || tokens[i].type === "td_open") {
          // Find the inline content for this cell
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

      currentRow.push(rowCells);
    }

    i++;
  }

  return {
    element: {
      type: "table",
      tableHeader: tableHeader.length > 0 ? tableHeader : undefined,
      tableRows: tableRows.length > 0 ? tableRows : undefined,
      content: [],
    },
    endIndex: i,
  };
}
