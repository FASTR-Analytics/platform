// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  BorderStyle,
  convertInchesToTwip,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
} from "./deps.ts";
import type {
  DocElement,
  InlineContent,
  ParsedDocument,
} from "./document_model.ts";
import { parseEmailsInText } from "./parser.ts";
import type { StyleConfig, StyleConfigId } from "./style_config.ts";
import { STYLE_CONFIG, STYLE_CONFIGS } from "./style_config.ts";
import {
  createFooter,
  createNumbering,
  createStyles,
  getLinkColor,
  getPageProperties,
} from "./styles.ts";

export function buildWordDocument(
  parsedDoc: ParsedDocument,
  configId?: StyleConfigId,
): Document {
  const config = configId && configId !== "default"
    ? STYLE_CONFIGS[configId]
    : STYLE_CONFIG;

  // Track numbering instances for each new list (both numbered and bullet)
  let currentNumberingInstance = 0;
  let currentBulletInstance = 0;
  let lastWasNumberedList = false;
  let lastWasBulletList = false;

  const paragraphs: (Paragraph | Table)[] = parsedDoc.elements.map(
    (element, index) => {
      const isNumberedListItem = element.type === "list-item" &&
        element.listType === "numbered";
      const isBulletListItem = element.type === "list-item" &&
        element.listType === "bullet";
      const isListItem = isNumberedListItem || isBulletListItem;

      // Start a new numbering instance when we encounter a numbered list after a break
      if (isNumberedListItem && !lastWasNumberedList) {
        currentNumberingInstance++;
      }

      // Start a new bullet instance when we encounter a bullet list after a break
      if (isBulletListItem && !lastWasBulletList) {
        currentBulletInstance++;
      }

      // Check if this is the last item in a list
      const nextElement = parsedDoc.elements[index + 1];
      const nextIsListItem = nextElement?.type === "list-item";
      const isLastInList = isListItem && !nextIsListItem;

      // Check if we need spacing after this element (images, tables, list items)
      const needsSpacingAfter =
        (element.type === "image" || element.type === "table" ||
          isLastInList) && !!nextElement;

      lastWasNumberedList = isNumberedListItem;
      lastWasBulletList = isBulletListItem;

      return buildParagraph(
        element,
        config,
        currentNumberingInstance,
        currentBulletInstance,
        needsSpacingAfter,
      );
    },
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

function buildParagraph(
  element: DocElement,
  config: StyleConfig,
  numberingInstance: number,
  bulletInstance: number,
  needsSpacingAfter: boolean,
): Paragraph | Table {
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
        : element.level === 5
        ? HeadingLevel.HEADING_5
        : HeadingLevel.HEADING_6;

      return new Paragraph({
        heading: headingLevel,
        children,
      });
    }

    case "list-item": {
      const level = element.listLevel || 0;
      const levelConfig = level === 0
        ? config.list.level0
        : level === 1
        ? config.list.level1
        : config.list.level2;

      // Word's numbering definitions apply uniform spacing to all list items.
      // For the last item in a list, we need additional spacing to match the gap
      // between paragraphs. We achieve this via paragraph-level spacing override,
      // which is the standard Word pattern for this use case.
      // Calculation: normal between-item spacing (from numbering def) + list-to-paragraph gap
      const extraSpacing = needsSpacingAfter
        ? config.document.paragraphSpaceAfter
        : 0;

      return new Paragraph({
        numbering: {
          reference: element.listType === "bullet" ? "bullets" : "numbering",
          level: level,
          instance: element.listType === "numbered"
            ? numberingInstance
            : bulletInstance,
        },
        spacing: needsSpacingAfter
          ? {
            after: levelConfig.spaceAfter + extraSpacing,
          }
          : undefined,
        children,
      });
    }

    case "horizontal-rule":
      return new Paragraph({
        text: "",
        thematicBreak: true,
        spacing: {
          before: config.horizontalRule.spaceBefore,
          after: config.horizontalRule.spaceAfter +
            (needsSpacingAfter ? config.document.paragraphSpaceAfter : 0),
        },
      });

    case "blockquote":
      return new Paragraph({
        children,
        indent: {
          left: convertInchesToTwip(config.blockquote.leftIndent),
        },
        border: {
          left: {
            style: BorderStyle.SINGLE,
            size: config.blockquote.leftBorderSize,
            color: config.blockquote.leftBorderColor,
          },
        },
        spacing: {
          before: config.blockquote.spaceBefore,
          after: config.blockquote.spaceAfter +
            (needsSpacingAfter ? config.document.paragraphSpaceAfter : 0),
        },
      });

    case "table":
      return buildWordTable(element, config, needsSpacingAfter);

    case "image": {
      if (!element.imageData) {
        return new Paragraph({ children: [] });
      }

      try {
        const imageRun = createImageRun(element.imageData, config);
        return new Paragraph({
          children: [imageRun],
          spacing: needsSpacingAfter
            ? {
              after: config.document.paragraphSpaceAfter,
            }
            : undefined,
        });
      } catch (error) {
        console.error("Failed to create image:", error);
        return new Paragraph({
          children: [
            new TextRun({ text: `[Image: ${element.imageAlt || ""}]` }),
          ],
          spacing: needsSpacingAfter
            ? {
              after: config.document.paragraphSpaceAfter,
            }
            : undefined,
        });
      }
    }

    case "paragraph":
    default:
      return new Paragraph({
        children,
      });
  }
}

function createImageRun(dataUrl: string, config: StyleConfig): ImageRun {
  // Parse data URL: data:image/png;base64,xxxxx
  const matches = dataUrl.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data URL format");
  }

  const [, imageType, base64Data] = matches;

  // Convert base64 to Uint8Array (browser-compatible)
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  // Map jpeg to jpg for docx compatibility
  let normalizedType = imageType.toLowerCase();
  if (normalizedType === "jpeg") {
    normalizedType = "jpg";
  }

  // SVG requires special handling, so only support raster formats
  if (!["png", "jpg", "gif", "bmp"].includes(normalizedType)) {
    throw new Error(`Unsupported image type: ${imageType}`);
  }

  // Calculate dimensions: full width with default aspect ratio
  // Convert inches to pixels at 96 DPI (docx library standard)
  const widthPixels = config.image.maxWidthInches * 96;
  const heightPixels = widthPixels / config.image.defaultAspectRatio;

  return new ImageRun({
    type: normalizedType as "png" | "jpg" | "gif" | "bmp",
    data: bytes,
    transformation: {
      width: widthPixels,
      height: heightPixels,
    },
  });
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

      case "break":
        result.push(
          new TextRun({
            text: "",
            break: 1,
          }),
        );
        break;
    }
  }

  return result;
}

function buildWordTable(
  element: DocElement,
  config: StyleConfig,
  needsSpacingAfter: boolean,
): Table {
  const rows: TableRow[] = [];

  // Build header rows if present
  if (element.tableHeader && element.tableHeader.length > 0) {
    for (const headerRow of element.tableHeader) {
      const cells = headerRow.map((cellContent) =>
        new TableCell({
          children: [
            new Paragraph({
              children: buildInlineContent(cellContent, config),
              spacing: {
                before: 0,
                after: 0,
              },
            }),
          ],
          shading: {
            type: config.table.headerShading.type,
            fill: config.table.headerShading.fill,
            color: config.table.headerShading.color,
          },
          margins: config.table.cellMargins,
        })
      );
      rows.push(new TableRow({ children: cells }));
    }
  }

  // Build body rows if present
  if (element.tableRows && element.tableRows.length > 0) {
    for (const bodyRow of element.tableRows) {
      const cells = bodyRow.map((cellContent) =>
        new TableCell({
          children: [
            new Paragraph({
              children: buildInlineContent(cellContent, config),
              spacing: {
                before: 0,
                after: 0,
              },
            }),
          ],
          margins: config.table.cellMargins,
        })
      );
      rows.push(new TableRow({ children: cells }));
    }
  }

  const extraSpacing = needsSpacingAfter
    ? config.document.paragraphSpaceAfter
    : 0;

  return new Table({
    rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    margins: {
      top: config.table.spaceBefore,
      bottom: config.table.spaceAfter + extraSpacing,
    },
    borders: {
      top: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
      bottom: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
      left: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
      right: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        size: config.table.borders.size,
        color: config.table.borders.color,
      },
    },
  });
}

// export async function saveWordDocument(
//   doc: Document,
//   outputPath: string
// ): Promise<void> {
//   const buffer = await Packer.toBuffer(doc);
//   await Deno.writeFile(outputPath, buffer);
// }
