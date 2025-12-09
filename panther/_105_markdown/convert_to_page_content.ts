// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { DocElement, InlineContent } from "./doc_element_types.ts";
import {
  type CustomFigureStyleOptions,
  type CustomMarkdownStyleOptions,
  type FigureInputs,
  type ImageInputs,
  type ImageMap,
  type MarkdownRendererInput,
  type TableData,
  type TableInputs,
} from "./deps.ts";
import type { FigureMap } from "./types.ts";

export type ConvertedPageContent =
  | MarkdownRendererInput
  | TableInputs
  | ImageInputs
  | FigureInputs;

export type ContentGroup = {
  type: "text" | "table" | "image";
  elements: DocElement[];
};

export function groupDocElementsByContentType(
  elements: DocElement[],
): ContentGroup[] {
  const groups: ContentGroup[] = [];
  let currentTextGroup: DocElement[] = [];

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
  styleMarkdown?: CustomMarkdownStyleOptions,
  styleFigure?: CustomFigureStyleOptions,
): ConvertedPageContent | undefined {
  if (group.type === "table") {
    const tableData = convertMarkdownTableToTableData(group.elements[0]);
    return { tableData, style: styleFigure };
  }

  if (group.type === "image") {
    const element = group.elements[0];
    const imageSrc = element.imageData;
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

  return { markdown, style: styleMarkdown };
}

export function docElementToPageContentItem(
  element: DocElement,
  images?: ImageMap,
): ConvertedPageContent | undefined {
  if (element.type === "table") {
    const tableData = convertMarkdownTableToTableData(element);
    return { tableData };
  }

  if (element.type === "image" && element.imageData) {
    return undefined;
  }

  return {
    markdown: docElementToMarkdown(element),
  };
}

function convertMarkdownTableToTableData(element: DocElement): TableData {
  const headers = element.tableHeader?.[0] || [];
  const rows = element.tableRows || [];

  const colHeaders = headers.map((cell) => inlineContentToPlainText(cell));
  const dataRows = rows.map((row) =>
    row.map((cell) => inlineContentToPlainText(cell))
  );

  const tableData: TableData = {
    isTransformed: true,
    colGroups: [{
      label: undefined,
      cols: colHeaders.map((header, index) => ({
        label: header,
        index,
        width: undefined,
      })),
    }],
    rowGroups: [{
      label: undefined,
      rows: dataRows.map((row, index) => ({
        label: undefined,
        index,
        values: row,
      })),
    }],
    aoa: dataRows,
  };

  return tableData;
}

export function docElementToMarkdown(element: DocElement): string {
  switch (element.type) {
    case "heading": {
      const level = element.level ?? 1;
      const hashes = "#".repeat(level);
      const text = inlineContentToString(element.content);
      return `${hashes} ${text}`;
    }

    case "paragraph":
      return inlineContentToString(element.content);

    case "list-item": {
      const prefix = element.listType === "numbered"
        ? `${element.listIndex ?? 1}. `
        : "- ";
      const indent = "  ".repeat(element.listLevel ?? 0);
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
      return "```\n" + (element.codeContent ?? "") + "```";

    default:
      return "";
  }
}

function inlineContentToString(content: InlineContent[]): string {
  return content.map((c) => {
    if (c.type === "break") return "\n";

    let text = c.text;

    if (c.type === "bold") {
      text = `**${text}**`;
    } else if (c.type === "italic") {
      text = `*${text}*`;
    } else if (c.type === "link" && c.url) {
      text = `[${text}](${c.url})`;
    } else if (c.type === "email" && c.url) {
      text = `[${text}](mailto:${c.url})`;
    }

    return text;
  }).join("");
}

function inlineContentToPlainText(content: InlineContent[]): string {
  return content.map((c) => {
    if (c.type === "break") return "\n";
    return c.text;
  }).join("");
}
