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
import { parseMarkdown } from "./parser.ts";
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

type EmphasisMarker = "*" | "**";

type EmphasisRun = { markers: EmphasisMarker[]; body: string };

// Bold and italic are written as nested markers, so a change of emphasis
// closes and opens only the marker that changes, with a run's edge whitespace
// outside them, because CommonMark reads a marker before a space as no opener
// and one after a space as no closer. Its flanking rules still misread some
// changes inside a word, so the string is parsed back, and a wrap per run of
// one emphasis is the fallback.
function inlineContentToString(content: MarkdownInline[]): string {
  return paragraphsOf(content).map(paragraphToString).join("\n\n");
}

function paragraphToString(content: MarkdownInline[]): string {
  const nested = nestedEmphasisString(content);
  return sameEmphasis(parseMarkdown(nested).items, content)
    ? nested
    : perRunEmphasisString(content);
}

// The parser joins a blockquote's paragraphs with two breaks, and emphasis
// cannot cross a paragraph, so each one is written and parsed back alone.
function paragraphsOf(content: MarkdownInline[]): MarkdownInline[][] {
  const paragraphs: MarkdownInline[][] = [];
  let current: MarkdownInline[] = [];
  for (let i = 0; i < content.length; i++) {
    if (content[i].type === "break" && content[i + 1]?.type === "break") {
      paragraphs.push(current);
      current = [];
      i++;
    } else {
      current.push(content[i]);
    }
  }
  return [...paragraphs, current];
}

function nestedEmphasisString(content: MarkdownInline[]): string {
  const runs = content
    .map((c): EmphasisRun => ({
      markers: markersOf(emphasisOf(c)),
      body: inlineBody(c),
    }))
    .filter((run) => run.body !== "");
  const reach = markerReach(runs);
  let out = "";
  let open: EmphasisMarker[] = [];
  let pendingSpace = "";
  runs.forEach((run, i) => {
    const core = run.body.trim();
    if (core === "") {
      pendingSpace += run.body;
      return;
    }
    const firstToClose = open.findIndex((m) => !run.markers.includes(m));
    const keep = firstToClose === -1 ? open.length : firstToClose;
    out += open.slice(keep).reverse().join("");
    open = open.slice(0, keep);
    const toOpen = run.markers
      .filter((m) => !open.includes(m))
      .sort((a, b) => reach[i][b] - reach[i][a]);
    out += pendingSpace + leadingWhitespace(run.body) + toOpen.join("") + core;
    open = [...open, ...toOpen];
    pendingSpace = trailingWhitespace(run.body);
  });
  return out + [...open].reverse().join("") + pendingSpace;
}

// How many runs from each one on keep each marker, blank runs skipped, so the
// marker that stays open longer is opened first and closed last.
function markerReach(
  runs: EmphasisRun[],
): Record<EmphasisMarker, number>[] {
  const reach: Record<EmphasisMarker, number>[] = [];
  let next: Record<EmphasisMarker, number> = { "*": 0, "**": 0 };
  for (let i = runs.length - 1; i >= 0; i--) {
    if (runs[i].body.trim() !== "") {
      next = {
        "*": runs[i].markers.includes("*") ? next["*"] + 1 : 0,
        "**": runs[i].markers.includes("**") ? next["**"] + 1 : 0,
      };
    }
    reach[i] = next;
  }
  return reach;
}

function markersOf(emphasis: InlineEmphasis): EmphasisMarker[] {
  switch (emphasis) {
    case "bold-italic":
      return ["*", "**"];
    case "bold":
      return ["**"];
    case "italic":
      return ["*"];
    case undefined:
      return [];
  }
}

function sameEmphasis(
  items: ParsedMarkdownItem[],
  content: MarkdownInline[],
): boolean {
  return items.length === 1 && "content" in items[0] &&
    emphasisSignature(items[0].content) === emphasisSignature(content);
}

// Each non-whitespace character with its emphasis, and the whitespace as it
// is, so a space written outside a marker still reads as the same content.
function emphasisSignature(content: MarkdownInline[]): string {
  return content.map((c) => {
    if (c.type === "break") return "\n";
    const emphasis = emphasisOf(c) ?? "";
    return [...c.text].map((ch) => /\s/.test(ch) ? ch : `${ch}${emphasis}|`)
      .join("");
  }).join("");
}

// Consecutive inlines of one emphasis are wrapped once, because a closing
// marker written against the next opening one merges with it into a run of
// asterisks that no longer closes or opens anything.
function perRunEmphasisString(content: MarkdownInline[]): string {
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

// The run's edge whitespace goes outside its markers, because CommonMark reads
// a marker before a space as no opener and one after a space as no closer.
function emphasize(text: string, style: InlineEmphasis): string {
  const marker = style === "bold-italic"
    ? "***"
    : style === "bold"
    ? "**"
    : style === "italic"
    ? "*"
    : "";
  const core = text.trim();
  if (marker === "" || core === "") return text;
  return `${leadingWhitespace(text)}${marker}${core}${marker}${
    trailingWhitespace(text)
  }`;
}

function leadingWhitespace(text: string): string {
  return text.slice(0, text.length - text.trimStart().length);
}

function trailingWhitespace(text: string): string {
  return text.slice(text.trimEnd().length);
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
