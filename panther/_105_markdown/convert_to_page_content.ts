// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  CustomMarkdownStyleOptions,
  FigureInputs,
  ImageInputs,
  ImageMap,
  MarkdownRendererInput,
  TableInputs,
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
    const nCols = tableData.colGroups[0].cols.length;
    return { tableData, columnWidths: Array(nCols).fill("auto") };
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
  _images?: ImageMap,
): ConvertedPageContent | undefined {
  if (element.type === "table") {
    const tableData = convertMarkdownTableToTableData(element);
    const nCols = tableData.colGroups[0].cols.length;
    return { tableData, columnWidths: Array(nCols).fill("auto") };
  }

  if (element.type === "image" && element.src) {
    return undefined;
  }

  return {
    markdown: docElementToMarkdown(element),
  };
}

// Return type is inferred (not annotated as the public `TableData` union) so
// callers in this file can read `.colGroups` directly without a runtime type
// guard -- this always constructs the transformed shape, never the JSON one.
function convertMarkdownTableToTableData(
  element: ParsedMarkdownItem & { type: "table" },
) {
  const headers = element.header?.[0] || [];
  const rows = element.rows || [];

  const colHeaders = headers.map((cell) => inlineContentToPlainText(cell));
  const dataRows = rows.map((row) =>
    row.map((cell) => inlineContentToPlainText(cell))
  );

  const tableData = {
    isTransformed: true as const,
    colGroups: [{
      id: undefined,
      label: undefined,
      cols: colHeaders.map((header, index) => ({
        id: header,
        label: header,
        index,
      })),
    }],
    rowGroups: [{
      id: undefined,
      label: undefined,
      rows: dataRows.map((row, index) => ({
        id: undefined,
        label: undefined,
        index,
        values: row,
      })),
    }],
    aoa: dataRows,
  };

  return tableData;
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

    case "math-block":
      return "$$\n" + element.latex + "\n$$";

    case "image":
      return `![${element.alt}](${element.src})`;

    case "table":
      return "";
  }
}

function inlineContentToString(content: MarkdownInline[]): string {
  return content.map((c) => {
    switch (c.type) {
      case "break":
        return "\n";
      case "text":
        return c.text;
      case "bold":
        return `**${c.text}**`;
      case "italic":
        return `*${c.text}*`;
      case "bold-italic":
        return `***${c.text}***`;
      case "link":
        return `[${c.text}](${c.url})`;
      case "code-inline":
        return `\`${c.text}\``;
      case "math-inline":
        return `$${c.latex}$`;
    }
  }).join("");
}

function inlineContentToPlainText(content: MarkdownInline[]): string {
  return content.map((c) => {
    if (c.type === "break") return "\n";
    if (c.type === "math-inline") return c.latex;
    return c.text;
  }).join("");
}
