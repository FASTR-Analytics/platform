// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ConvertMarkdownToWordOptions,
  PageBreakRules,
} from "./converter.ts";
import type {
  DocElement,
  DocxMath,
  InlineContent,
  MergedMarkdownStyle,
  ParsedDocument,
} from "./deps.ts";
import {
  BorderStyle,
  CustomMarkdownStyle,
  Document,
  ExternalHyperlink,
  HeadingLevel,
  ImageRun,
  Paragraph,
  parseEmailsInText,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "./deps.ts";
import { latexToDocxMath } from "./latex_to_math.ts";
import {
  createFooterFromWordConfig,
  createNumberingFromMerged,
  createStylesFromMerged,
  getLinkColorFromMerged,
  getPagePropertiesFromWordConfig,
  mergeWordConfig,
} from "./styles.ts";
import {
  DEFAULT_WORD_SPECIFIC_CONFIG,
  type WordSpecificConfig,
} from "./word_specific_config.ts";
import { pixelsToTwips } from "./word_units.ts";

export function buildWordDocument(
  parsedDoc: ParsedDocument,
  options?: ConvertMarkdownToWordOptions,
): Document {
  const styleClass = new CustomMarkdownStyle(options?.markdownStyle);
  const merged = styleClass.getMergedMarkdownStyle();

  const wordConfig = mergeWordConfig(options?.wordConfig);

  let currentNumberingInstance = 0;
  let currentBulletInstance = 0;
  let prevMarginBottom = 0;

  const paragraphs: (Paragraph | Table)[] = parsedDoc.elements.map(
    (element, index) => {
      const isNumberedListItem = element.type === "list-item" &&
        element.listType === "numbered";
      const isBulletListItem = element.type === "list-item" &&
        element.listType === "bullet";

      if (
        isNumberedListItem &&
        (index === 0 ||
          parsedDoc.elements[index - 1]?.type !== "list-item" ||
          (parsedDoc.elements[index - 1] as any).listType !== "numbered")
      ) {
        currentNumberingInstance++;
      }

      if (
        isBulletListItem &&
        (index === 0 ||
          parsedDoc.elements[index - 1]?.type !== "list-item" ||
          (parsedDoc.elements[index - 1] as any).listType !== "bullet")
      ) {
        currentBulletInstance++;
      }

      const margins = getElementMargins(element, merged);
      const isFirst = index === 0;
      const isLast = index === parsedDoc.elements.length - 1;

      const collapsedSpacingBefore = isFirst
        ? 0
        : Math.max(prevMarginBottom, margins.top);

      const nextElement = parsedDoc.elements[index + 1];
      const spacingAfter = isLast ? 0 : nextElement?.type === "table" ||
          nextElement?.type === "code-block" ||
          nextElement?.type === "blockquote"
        ? getElementMargins(nextElement, merged).top
        : 0;

      prevMarginBottom = margins.bottom;

      return buildParagraph(
        element,
        merged,
        wordConfig,
        currentNumberingInstance,
        currentBulletInstance,
        collapsedSpacingBefore,
        spacingAfter,
        options?.pageBreakRules,
        index === 0,
      );
    },
  );

  return new Document({
    styles: createStylesFromMerged(merged, wordConfig),
    numbering: createNumberingFromMerged(merged, wordConfig),
    sections: [
      {
        properties: getPagePropertiesFromWordConfig(wordConfig),
        children: paragraphs,
        footers: {
          default: createFooterFromWordConfig(wordConfig),
        },
      },
    ],
  });
}

type ElementMargins = { top: number; bottom: number };

function getElementMargins(
  element: DocElement,
  merged: MergedMarkdownStyle,
): ElementMargins {
  switch (element.type) {
    case "paragraph":
      return merged.margins.paragraph;
    case "heading": {
      const key = `h${element.level}` as
        | "h1"
        | "h2"
        | "h3"
        | "h4"
        | "h5"
        | "h6";
      return merged.margins[key];
    }
    case "list-item": {
      return {
        top: element.isFirstInList
          ? merged.margins.list.top
          : merged.margins.list.gap,
        bottom: element.isLastInList
          ? merged.margins.list.bottom
          : merged.margins.list.gap,
      };
    }
    case "blockquote":
      return merged.margins.blockquote;
    case "horizontal-rule":
      return merged.margins.horizontalRule;
    case "image":
      return merged.margins.image;
    case "table":
      return merged.margins.table;
    case "code-block":
      return merged.margins.code;
    case "math-block":
      return merged.margins.paragraph;
  }
}

function shouldPageBreakBefore(
  element: DocElement,
  pageBreakRules: PageBreakRules | undefined,
  isFirst: boolean,
): boolean {
  if (isFirst || !pageBreakRules) return false;
  if (element.type !== "heading") return false;
  if (element.level === 1 && pageBreakRules.h1AlwaysNewPage) return true;
  if (element.level === 2 && pageBreakRules.h2AlwaysNewPage) return true;
  if (element.level === 3 && pageBreakRules.h3AlwaysNewPage) return true;
  return false;
}

function buildParagraph(
  element: DocElement,
  merged: MergedMarkdownStyle,
  wordConfig: WordSpecificConfig,
  numberingInstance: number,
  bulletInstance: number,
  spacingBefore: number,
  spacingAfter: number,
  pageBreakRules: PageBreakRules | undefined,
  isFirst: boolean,
): Paragraph | Table {
  const children = buildInlineContent(element.content, merged);
  const pageBreakBefore = shouldPageBreakBefore(
    element,
    pageBreakRules,
    isFirst,
  );

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
        spacing: {
          before: pixelsToTwips(spacingBefore),
          after: pixelsToTwips(spacingAfter),
        },
        pageBreakBefore,
      });
    }

    case "list-item": {
      const level = element.listLevel || 0;

      return new Paragraph({
        numbering: {
          reference: element.listType === "bullet" ? "bullets" : "numbering",
          level: level,
          instance: element.listType === "numbered"
            ? numberingInstance
            : bulletInstance,
        },
        spacing: {
          before: pixelsToTwips(spacingBefore),
          after: pixelsToTwips(spacingAfter),
        },
        children,
      });
    }

    case "horizontal-rule": {
      const hrColor = merged.horizontalRule.strokeColor.replace("#", "");
      const hrWidth = merged.horizontalRule.strokeWidth * 8;
      return new Paragraph({
        text: "",
        border: {
          bottom: {
            style: BorderStyle.SINGLE,
            size: hrWidth,
            color: hrColor,
          },
        },
        spacing: {
          before: pixelsToTwips(spacingBefore),
          after: pixelsToTwips(spacingAfter),
          line: 0,
        },
      });
    }

    case "blockquote": {
      const borderColor = merged.blockquote.leftBorderColor.replace("#", "");
      const borderWidth = pixelsToTwips(merged.blockquote.leftBorderWidth);
      const paddingTop = pixelsToTwips(merged.blockquote.paddingTop);
      const paddingBottom = pixelsToTwips(merged.blockquote.paddingBottom);
      const paddingLeft = pixelsToTwips(merged.blockquote.paddingLeft);
      const paddingRight = pixelsToTwips(merged.blockquote.paddingRight);
      const paragraphGap = pixelsToTwips(merged.blockquote.paragraphGap);

      // Blockquote text style - italic by default
      const bqBaseStyle: BaseTextStyle = {
        italics: true,
      };

      // Split content into paragraphs at double-break boundaries
      // In the parsed content, double breaks represent paragraph separators
      const contentGroups: InlineContent[][] = [];
      let currentGroup: InlineContent[] = [];
      let consecutiveBreaks = 0;

      for (const item of element.content) {
        if (item.type === "break") {
          consecutiveBreaks++;
          if (consecutiveBreaks >= 2) {
            // Double break = paragraph separator
            if (currentGroup.length > 0) {
              contentGroups.push(currentGroup);
              currentGroup = [];
            }
            consecutiveBreaks = 0;
          }
        } else {
          // Not a break - add any pending single breaks and the item
          while (consecutiveBreaks > 0) {
            currentGroup.push({ type: "break", text: "" });
            consecutiveBreaks--;
          }
          currentGroup.push(item);
        }
      }
      if (currentGroup.length > 0) {
        contentGroups.push(currentGroup);
      }

      // Create paragraphs with proper spacing
      const paragraphs: Paragraph[] = contentGroups.map((group, idx) =>
        new Paragraph({
          children: buildInlineContent(group, merged, bqBaseStyle),
          spacing: {
            before: idx > 0 ? paragraphGap : 0,
            after: 0,
          },
        })
      );

      return new Table({
        rows: [
          new TableRow({
            children: [
              // Left border cell (narrow colored bar)
              new TableCell({
                children: [new Paragraph({ children: [] })],
                width: { size: borderWidth, type: WidthType.DXA },
                shading: {
                  type: ShadingType.CLEAR,
                  fill: borderColor,
                  color: "auto",
                },
                margins: { top: 0, bottom: 0, left: 0, right: 0 },
              }),
              // Content cell
              new TableCell({
                children: paragraphs,
                margins: {
                  top: paddingTop,
                  bottom: paddingBottom,
                  left: paddingLeft,
                  right: paddingRight,
                },
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: {
            style: BorderStyle.NONE,
            size: 0,
            color: "FFFFFF",
          },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
      });
    }

    case "table":
      return buildWordTable(
        element,
        merged,
        wordConfig,
        spacingBefore,
        spacingAfter,
      );

    case "image": {
      if (!element.imageData) {
        return new Paragraph({ children: [] });
      }

      try {
        const imageRun = createImageRun(element, merged, wordConfig);
        return new Paragraph({
          children: [imageRun],
          spacing: {
            before: pixelsToTwips(spacingBefore),
            after: pixelsToTwips(spacingAfter),
          },
        });
      } catch (error) {
        console.error("Failed to create image:", error);
        return new Paragraph({
          children: [
            new TextRun({ text: `[Image: ${element.imageAlt || ""}]` }),
          ],
          spacing: {
            before: pixelsToTwips(spacingBefore),
            after: pixelsToTwips(spacingAfter),
          },
        });
      }
    }

    case "code-block": {
      const codeLines = (element.codeContent ?? "").split("\n");
      if (codeLines.length > 0 && codeLines[codeLines.length - 1] === "") {
        codeLines.pop();
      }
      const codeChildren: TextRun[] = [];
      for (let i = 0; i < codeLines.length; i++) {
        if (i > 0) {
          codeChildren.push(new TextRun({ text: "", break: 1 }));
        }
        codeChildren.push(
          new TextRun({
            text: codeLines[i],
            font: "Consolas",
          }),
        );
      }
      const bgColor = merged.code.backgroundColor.replace("#", "");
      const codePaddingH = pixelsToTwips(merged.code.paddingHorizontal);
      const codePaddingV = pixelsToTwips(merged.code.paddingVertical);

      // Use a single-cell table to get proper internal padding with shading
      return new Table({
        rows: [
          new TableRow({
            children: [
              new TableCell({
                children: [
                  new Paragraph({
                    children: codeChildren,
                    spacing: { before: 0, after: 0 },
                  }),
                ],
                shading: {
                  type: ShadingType.CLEAR,
                  fill: bgColor,
                  color: "auto",
                },
                margins: {
                  top: codePaddingV,
                  bottom: codePaddingV,
                  left: codePaddingH,
                  right: codePaddingH,
                },
              }),
            ],
          }),
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
          insideHorizontal: {
            style: BorderStyle.NONE,
            size: 0,
            color: "FFFFFF",
          },
          insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
      });
    }

    case "math-block": {
      const mathContent = element.mathLatex ?? "";
      const mathObj = latexToDocxMath(mathContent);
      return new Paragraph({
        children: [mathObj],
        spacing: {
          before: pixelsToTwips(spacingBefore),
          after: pixelsToTwips(spacingAfter),
        },
      });
    }

    case "paragraph":
    default:
      return new Paragraph({
        children,
        spacing: {
          before: pixelsToTwips(spacingBefore),
          after: pixelsToTwips(spacingAfter),
        },
      });
  }
}

function createImageRun(
  element: DocElement,
  merged: MergedMarkdownStyle,
  wordConfig: WordSpecificConfig,
): ImageRun {
  const matches = element.imageData!.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    throw new Error("Invalid image data URL format");
  }

  const [, imageType, base64Data] = matches;

  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  let normalizedType = imageType.toLowerCase();
  if (normalizedType === "jpeg") {
    normalizedType = "jpg";
  }

  if (!["png", "jpg", "gif", "bmp"].includes(normalizedType)) {
    throw new Error(`Unsupported image type: ${imageType}`);
  }

  let widthPixels: number;
  let heightPixels: number;

  if (element.imageWidth && element.imageHeight) {
    const maxWidthInches = wordConfig.image?.maxWidthInches ??
      DEFAULT_WORD_SPECIFIC_CONFIG.image!.maxWidthInches!;
    const maxWidthPixels = maxWidthInches * 96;

    const scale = Math.min(1, maxWidthPixels / element.imageWidth);
    widthPixels = element.imageWidth * scale;
    heightPixels = element.imageHeight * scale;
  } else {
    const maxWidthInches = wordConfig.image?.maxWidthInches ??
      DEFAULT_WORD_SPECIFIC_CONFIG.image!.maxWidthInches!;
    widthPixels = maxWidthInches * 96;
    heightPixels = widthPixels / merged.image.defaultAspectRatio;
  }

  return new ImageRun({
    type: normalizedType as "png" | "jpg" | "gif" | "bmp",
    data: bytes,
    transformation: {
      width: widthPixels,
      height: heightPixels,
    },
  });
}

type BaseTextStyle = {
  italics?: boolean;
};

function buildInlineContent(
  content: InlineContent[],
  merged: MergedMarkdownStyle,
  baseStyle?: BaseTextStyle,
): (TextRun | ExternalHyperlink | DocxMath)[] {
  const result: (TextRun | ExternalHyperlink | DocxMath)[] = [];
  const linkColor = getLinkColorFromMerged(merged);

  for (const item of content) {
    switch (item.type) {
      case "text": {
        const emailParts = parseEmailsInText(item.text);
        for (const part of emailParts) {
          if (part.type === "email" && part.url) {
            result.push(
              new ExternalHyperlink({
                children: [
                  new TextRun({
                    text: part.text,
                    color: linkColor,
                    underline: {},
                    italics: baseStyle?.italics,
                  }),
                ],
                link: part.url,
              }),
            );
          } else {
            result.push(
              new TextRun({
                text: part.text,
                italics: baseStyle?.italics,
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
            italics: baseStyle?.italics,
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
                color: linkColor,
                underline: {},
                italics: baseStyle?.italics,
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
                color: linkColor,
                underline: {},
                italics: baseStyle?.italics,
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

      case "math-inline":
        result.push(latexToDocxMath(item.text));
        break;
    }
  }

  return result;
}

function buildWordTable(
  element: DocElement,
  merged: MergedMarkdownStyle,
  wordConfig: WordSpecificConfig,
  spacingBefore: number,
  spacingAfter: number,
): Table {
  const rows: TableRow[] = [];

  const cellMargins = {
    top: pixelsToTwips(merged.table.cellPaddingVertical),
    bottom: pixelsToTwips(merged.table.cellPaddingVertical),
    left: pixelsToTwips(merged.table.cellPaddingHorizontal),
    right: pixelsToTwips(merged.table.cellPaddingHorizontal),
  };

  const borderSize = merged.table.borderWidth * 8;
  const borderColor = merged.table.borderColor;

  if (element.tableHeader && element.tableHeader.length > 0) {
    for (const headerRow of element.tableHeader) {
      const cells = headerRow.map(
        (cellContent) =>
          new TableCell({
            children: [
              new Paragraph({
                children: buildInlineContent(cellContent, merged),
                spacing: {
                  before: 0,
                  after: 0,
                },
              }),
            ],
            shading: {
              type: ShadingType.CLEAR,
              fill: merged.table.headerShadingColor.replace("#", ""),
              color: "auto",
            },
            margins: cellMargins,
          }),
      );
      rows.push(new TableRow({ children: cells }));
    }
  }

  if (element.tableRows && element.tableRows.length > 0) {
    for (const bodyRow of element.tableRows) {
      const cells = bodyRow.map(
        (cellContent) =>
          new TableCell({
            children: [
              new Paragraph({
                children: buildInlineContent(cellContent, merged),
                spacing: {
                  before: 0,
                  after: 0,
                },
              }),
            ],
            margins: cellMargins,
          }),
      );
      rows.push(new TableRow({ children: cells }));
    }
  }

  return new Table({
    rows,
    width: {
      size: 100,
      type: WidthType.PERCENTAGE,
    },
    margins: cellMargins,
    borders: {
      top: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
      },
      bottom: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
      },
      left: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
      },
      right: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
      },
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
      },
      insideVertical: {
        style: BorderStyle.SINGLE,
        size: borderSize,
        color: borderColor,
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
