// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  Document,
  ExternalHyperlink,
  HeadingLevel,
  Paragraph,
  TextRun,
} from "./deps.ts";
import type {
  DocElement,
  InlineContent,
  ParsedDocument,
} from "./document_model.ts";
import { parseEmailsInText } from "./parser.ts";
import type { StyleConfig } from "./style_config.ts";
import { STYLE_CONFIG } from "./style_config.ts";
import {
  createFooter,
  createNumbering,
  createStyles,
  getLinkColor,
  getPageProperties,
} from "./styles.ts";

export function buildWordDocument(
  parsedDoc: ParsedDocument,
  config: StyleConfig = STYLE_CONFIG,
): Document {
  const paragraphs = parsedDoc.elements.map((element) =>
    buildParagraph(element, config)
  );

  return new Document({
    styles: createStyles(config),
    numbering: createNumbering(config),
    sections: [
      {
        properties: getPageProperties(config),
        children: paragraphs,
        footers: {
          default: createFooter(config),
        },
      },
    ],
  });
}

function buildParagraph(element: DocElement, config: StyleConfig): Paragraph {
  const children = buildInlineContent(element.content, config);

  switch (element.type) {
    case "heading": {
      const headingLevel = element.level === 1
        ? HeadingLevel.HEADING_1
        : element.level === 2
        ? HeadingLevel.HEADING_2
        : element.level === 3
        ? HeadingLevel.HEADING_3
        : element.level === 4
        ? HeadingLevel.HEADING_4
        : HeadingLevel.HEADING_5;

      return new Paragraph({
        heading: headingLevel,
        children,
      });
    }

    case "list-item":
      return new Paragraph({
        numbering: {
          reference: element.listType === "bullet" ? "bullets" : "numbering",
          level: element.listLevel || 0,
        },
        children,
      });

    case "paragraph":
    default:
      return new Paragraph({
        children,
      });
  }
}

function buildInlineContent(
  content: InlineContent[],
  config: StyleConfig,
): (TextRun | ExternalHyperlink)[] {
  const result: (TextRun | ExternalHyperlink)[] = [];

  for (const item of content) {
    switch (item.type) {
      case "text": {
        // Check for emails in plain text
        const emailParts = parseEmailsInText(item.text);
        for (const part of emailParts) {
          if (part.type === "email" && part.url) {
            result.push(
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: part.text,
                    color: getLinkColor(config),
                    underline: {},
                  }),
                ],
                link: part.url,
              }),
            );
          } else {
            result.push(
              new TextRun({
                text: part.text,
              }),
            );
          }
        }
        break;
      }

      case "bold":
        result.push(
          new TextRun({
            text: item.text,
            bold: true,
          }),
        );
        break;

      case "italic":
        result.push(
          new TextRun({
            text: item.text,
            italics: true,
          }),
        );
        break;

      case "link":
        result.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: item.text,
                color: getLinkColor(config),
                underline: {},
              }),
            ],
            link: item.url || "",
          }),
        );
        break;

      case "email":
        result.push(
          new ExternalHyperlink({
            children: [
              new TextRun({
                text: item.text,
                color: getLinkColor(config),
                underline: {},
              }),
            ],
            link: item.url || `mailto:${item.text}`,
          }),
        );
        break;
    }
  }

  return result;
}

// export async function saveWordDocument(
//   doc: Document,
//   outputPath: string
// ): Promise<void> {
//   const buffer = await Packer.toBuffer(doc);
//   await Deno.writeFile(outputPath, buffer);
// }
