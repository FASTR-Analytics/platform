// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  AlignH,
  CustomMarkdownStyleOptions,
  FigureInputs,
  ImageInputs,
  ImageMap,
  MarkdownRendererInput,
  TableDataTransformed,
  TableInputs,
} from "./deps.ts";
import {
  MARKDOWN_TABLE_COLUMN_DIMENSION,
  MARKDOWN_TABLE_ROW_DIMENSION,
} from "./deps.ts";
import type { FigureMap, MarkdownInline, ParsedMarkdownItem } from "./types.ts";

export type ConvertedPageContent =
  | MarkdownRendererInput
  | TableInputs
  | ImageInputs
  | FigureInputs;

export type ContentGroup = {
  type: "text" | "table" | "image";
  elements: ParsedMarkdownItem[];
};

export function groupDocElementsByContentType(
  elements: ParsedMarkdownItem[],
): ContentGroup[] {
  const groups: ContentGroup[] = [];
  let currentTextGroup: ParsedMarkdownItem[] = [];

  for (const element of elements) {
    if (element.type === "table" || element.type === "image") {
      if (currentTextGroup.length > 0) {
        groups.push({ type: "text", elements: currentTextGroup });
        currentTextGroup = [];
      }

      groups.push({
        type: element.type,
        elements: [element],
      });
    } else {
      currentTextGroup.push(element);
    }
  }

  if (currentTextGroup.length > 0) {
    groups.push({ type: "text", elements: currentTextGroup });
  }

  return groups;
}

export function contentGroupToPageContentItem(
  group: ContentGroup,
  images?: ImageMap,
  figures?: FigureMap,
  style?: CustomMarkdownStyleOptions,
): ConvertedPageContent | undefined {
  if (group.type === "table") {
    const element = group.elements[0];
    if (element.type !== "table") {
      return undefined;
    }
    const tableData = convertMarkdownTableToTableData(element);
    const nCols = tableData.cols?.groups[0].cols.length ?? 0;
    return {
      figureType: "table",
      data: tableData,
      columnWidths: Array(nCols).fill("auto"),
      style: getTableAlignStyle(element.align),
    };
  }

  if (group.type === "image") {
    const element = group.elements[0];
    if (element.type !== "image") {
      return undefined;
    }
    const imageSrc = element.src;
    if (!imageSrc) {
      return undefined;
    }

    if (figures) {
      const figureInputs = figures.get(imageSrc);
      if (figureInputs) {
        return figureInputs;
      }
    }

    if (images) {
      const imageData = images.get(imageSrc);
      if (imageData) {
        return {
          image: imageData.dataUrl,
          width: imageData.width,
          height: imageData.height,
        };
      }
    }

    return undefined;
  }

  const markdown = group.elements
    .map((el) => docElementToMarkdown(el))
    .join("\n\n");

  return { markdown, style };
}

export function docElementToPageContentItem(
  element: ParsedMarkdownItem,
  images?: ImageMap,
  figures?: FigureMap,
  style?: CustomMarkdownStyleOptions,
): ConvertedPageContent | undefined {
  const type = element.type === "table" || element.type === "image"
    ? element.type
    : "text";
  return contentGroupToPageContentItem(
    { type, elements: [element] },
    images,
    figures,
    style,
  );
}

function convertMarkdownTableToTableData(
  element: ParsedMarkdownItem & { type: "table" },
): TableDataTransformed {
  // GFM tables have exactly one header row (markdown-it emits one thead tr).
  const headers = element.header?.[0] || [];
  const rows = element.rows || [];

  const colHeaders = headers.map((cell) => inlineContentToPlainText(cell));
  const dataRows = rows.map((row) =>
    row.map((cell) => inlineContentToPlainText(cell))
  );

  return {
    isTransformed: true,
    cols: {
      dimension: MARKDOWN_TABLE_COLUMN_DIMENSION,
      groups: [{
        id: undefined,
        label: undefined,
        cols: colHeaders.map((header, index) => ({
          id: header,
          label: header,
          index,
        })),
      }],
    },
    rows: {
      dimension: MARKDOWN_TABLE_ROW_DIMENSION,
      groups: [{
        id: undefined,
        label: undefined,
        rows: dataRows.map((_row, index) => ({
          id: String(index),
          label: undefined,
          index,
        })),
      }],
    },
    aoa: dataRows,
  };
}

// A custom style rather than data, so an app-level tableCells /
// tableColHeaders func still supplies every other field per column.
function getTableAlignStyle(
  align: (AlignH | undefined)[] | undefined,
): TableInputs["style"] {
  if (!align) {
    return undefined;
  }
  const alignAt = (i: number | undefined) =>
    i === undefined ? {} : { alignH: align[i] };
  return {
    content: {
      tableCells: { func: (info) => alignAt(info.i_col) },
      tableColHeaders: { func: (info) => alignAt(info.index) },
    },
  };
}

export function docElementToMarkdown(element: ParsedMarkdownItem): string {
  switch (element.type) {
    case "heading": {
      const hashes = "#".repeat(element.level);
      const text = inlineContentToString(element.content);
      return `${hashes} ${text}`;
    }

    case "paragraph":
      return inlineContentToString(element.content);

    case "list-item": {
      const prefix = element.listType === "numbered"
        ? `${element.listIndex ?? 1}. `
        : "- ";
      const indent = "  ".repeat(element.level);
      const text = inlineContentToString(element.content);
      return `${indent}${prefix}${text}`;
    }

    case "blockquote": {
      const text = inlineContentToString(element.content);
      return text.split("\n").map((line) => `> ${line}`).join("\n");
    }

    case "horizontal-rule":
      return "---";

    case "code-block":
      return "```\n" + element.code + "```";

    case "image":
      return `![${element.alt}](${element.src})`;

    case "table":
      return "";
  }
}

type InlineEmphasis = (MarkdownInline & { type: "code-inline" })["style"];

// Consecutive inlines of one emphasis are wrapped once, because a closing
// marker written against the next opening one merges with it into a run of
// asterisks that no longer closes or opens anything.
function inlineContentToString(content: MarkdownInline[]): string {
  const groups: { emphasis: InlineEmphasis; body: string }[] = [];
  for (const c of content) {
    const emphasis = emphasisOf(c);
    const last = groups.at(-1);
    if (emphasis !== undefined && last?.emphasis === emphasis) {
      last.body += inlineBody(c);
    } else {
      groups.push({ emphasis, body: inlineBody(c) });
    }
  }
  return groups.map((g) => emphasize(g.body, g.emphasis)).join("");
}

function emphasisOf(c: MarkdownInline): InlineEmphasis {
  switch (c.type) {
    case "bold":
    case "italic":
    case "bold-italic":
      return c.type;
    case "code-inline":
      return c.style;
    default:
      return undefined;
  }
}

function inlineBody(c: MarkdownInline): string {
  switch (c.type) {
    case "break":
      return "\n";
    case "text":
    case "bold":
    case "italic":
    case "bold-italic":
      return escapeMarkdownText(c.text);
    case "link": {
      const text = c.code ? codeSpan(c.text) : escapeMarkdownText(c.text);
      return `[${emphasize(text, c.style)}](${c.url})`;
    }
    case "code-inline":
      return codeSpan(c.text);
  }
}

// A fence one backtick longer than the longest run inside, padded with a
// space where CommonMark would otherwise read an edge backtick as the fence
// or strip one of the text's own edge spaces.
function codeSpan(text: string): string {
  const longestRun = Math.max(
    0,
    ...(text.match(/`+/g) ?? []).map((run) => run.length),
  );
  const fence = "`".repeat(longestRun + 1);
  const pad = /^`|`$/.test(text) || /^ .*[^ ].* $/s.test(text) ? " " : "";
  return `${fence}${pad}${text}${pad}${fence}`;
}

function emphasize(text: string, style: InlineEmphasis): string {
  const marker = style === "bold-italic"
    ? "***"
    : style === "bold"
    ? "**"
    : style === "italic"
    ? "*"
    : "";
  return `${marker}${text}${marker}`;
}

// CommonMark lets a backslash escape any ASCII punctuation, so escaping all
// of it writes a parsed run back as text that parses as that text alone.
function escapeMarkdownText(text: string): string {
  return text.replace(/[!-\/:-@[-`{-~]/g, "\\$&");
}

function inlineContentToPlainText(content: MarkdownInline[]): string {
  return content.map((c) => {
    if (c.type === "break") return "\n";
    return c.text;
  }).join("");
}
