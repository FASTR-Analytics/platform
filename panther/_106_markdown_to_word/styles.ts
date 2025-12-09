// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  INumberingOptions,
  ISectionPropertiesOptions,
  IStylesOptions,
  MergedMarkdownStyle,
} from "./deps.ts";
import {
  AlignmentType,
  convertInchesToTwip,
  Footer,
  LevelFormat,
  PageNumber,
  Paragraph,
  TextRun,
} from "./deps.ts";
import {
  DEFAULT_WORD_SPECIFIC_CONFIG,
  type WordFont,
  type WordSpecificConfig,
} from "./word_specific_config.ts";
import {
  lineHeightToWordSpacing,
  pixelsToHalfPoints,
  pixelsToTwips,
} from "./word_units.ts";

function getFontFamily(wordFont: WordFont): string {
  switch (wordFont) {
    case "aptos":
      return "Aptos";
    case "calibri":
      return "Calibri";
    case "cambria":
      return "Cambria";
    case "arial":
      return "Arial";
    case "times-new-roman":
      return "Times New Roman";
  }
}

export function mergeWordConfig(
  custom?: WordSpecificConfig,
): WordSpecificConfig {
  const defaults = DEFAULT_WORD_SPECIFIC_CONFIG;

  return {
    font: custom?.font ?? defaults.font,
    lineHeightOverride: custom?.lineHeightOverride ??
      defaults.lineHeightOverride,
    page: {
      margins: {
        top: custom?.page?.margins?.top ?? defaults.page!.margins!.top,
        bottom: custom?.page?.margins?.bottom ?? defaults.page!.margins!.bottom,
        left: custom?.page?.margins?.left ?? defaults.page!.margins!.left,
        right: custom?.page?.margins?.right ?? defaults.page!.margins!.right,
      },
      orientation: custom?.page?.orientation ?? defaults.page!.orientation,
    },
    footer: {
      alignment: custom?.footer?.alignment ?? defaults.footer!.alignment,
      fontSize: custom?.footer?.fontSize ?? defaults.footer!.fontSize,
      showPageNumbers: custom?.footer?.showPageNumbers ??
        defaults.footer!.showPageNumbers,
      format: custom?.footer?.format ?? defaults.footer!.format,
    },
    table: {
      spaceBefore: custom?.table?.spaceBefore ?? defaults.table!.spaceBefore,
      spaceAfter: custom?.table?.spaceAfter ?? defaults.table!.spaceAfter,
    },
    image: {
      maxWidthInches: custom?.image?.maxWidthInches ??
        defaults.image!.maxWidthInches,
    },
  };
}

export function createStylesFromMerged(
  merged: MergedMarkdownStyle,
  wordConfig: WordSpecificConfig = DEFAULT_WORD_SPECIFIC_CONFIG,
): IStylesOptions {
  const fontFamily = getFontFamily(wordConfig.font ?? "cambria");
  const lineHeight = wordConfig.lineHeightOverride ??
    merged.text.paragraph.lineHeight;

  return {
    default: {
      document: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.paragraph.fontSize),
          color: merged.text.paragraph.color,
        },
        paragraph: {
          spacing: {
            line: lineHeightToWordSpacing(lineHeight),
            before: 0,
            after: 0,
          },
        },
      },
      heading1: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h1.fontSize),
          bold: true,
          color: merged.text.h1.color,
        },
        paragraph: {
          spacing: {
            before: 0,
            after: 0,
          },
        },
      },
      heading2: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h2.fontSize),
          bold: true,
          color: merged.text.h2.color,
        },
        paragraph: {
          spacing: {
            before: pixelsToTwips(merged.margins.h2.top),
            after: pixelsToTwips(merged.margins.h2.bottom),
          },
        },
      },
      heading3: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h3.fontSize),
          bold: true,
          color: merged.text.h3.color,
        },
        paragraph: {
          spacing: {
            before: pixelsToTwips(merged.margins.h3.top),
            after: pixelsToTwips(merged.margins.h3.bottom),
          },
        },
      },
      heading4: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h4.fontSize),
          bold: true,
          color: merged.text.h4.color,
        },
        paragraph: {
          spacing: {
            before: pixelsToTwips(merged.margins.h4.top),
            after: pixelsToTwips(merged.margins.h4.bottom),
          },
        },
      },
      heading5: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h5.fontSize),
          bold: true,
          color: merged.text.h5.color,
        },
        paragraph: {
          spacing: {
            before: pixelsToTwips(merged.margins.h5.top),
            after: pixelsToTwips(merged.margins.h5.bottom),
          },
        },
      },
      heading6: {
        run: {
          font: fontFamily,
          size: pixelsToHalfPoints(merged.text.h6.fontSize),
          bold: true,
          color: merged.text.h6.color,
        },
        paragraph: {
          spacing: {
            before: pixelsToTwips(merged.margins.h6.top),
            after: pixelsToTwips(merged.margins.h6.bottom),
          },
        },
      },
    },
  };
}

export function createNumberingFromMerged(
  merged: MergedMarkdownStyle,
  wordConfig: WordSpecificConfig = DEFAULT_WORD_SPECIFIC_CONFIG,
): INumberingOptions {
  const lineHeight = wordConfig.lineHeightOverride ??
    merged.text.list.lineHeight;

  return {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: merged.bulletList.level0.marker,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.bulletList.level0.textIndent),
                  hanging: pixelsToTwips(
                    merged.bulletList.level0.textIndent -
                      merged.bulletList.level0.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
          {
            level: 1,
            format: LevelFormat.BULLET,
            text: merged.bulletList.level1.marker,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.bulletList.level1.textIndent),
                  hanging: pixelsToTwips(
                    merged.bulletList.level1.textIndent -
                      merged.bulletList.level1.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
          {
            level: 2,
            format: LevelFormat.BULLET,
            text: merged.bulletList.level2.marker,
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.bulletList.level2.textIndent),
                  hanging: pixelsToTwips(
                    merged.bulletList.level2.textIndent -
                      merged.bulletList.level2.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
        ],
      },
      {
        reference: "numbering",
        levels: [
          {
            level: 0,
            format: LevelFormat.DECIMAL,
            text: "%1.",
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.numberedList.level0.textIndent),
                  hanging: pixelsToTwips(
                    merged.numberedList.level0.textIndent -
                      merged.numberedList.level0.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
          {
            level: 1,
            format: LevelFormat.DECIMAL,
            text: "%2.",
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.numberedList.level1.textIndent),
                  hanging: pixelsToTwips(
                    merged.numberedList.level1.textIndent -
                      merged.numberedList.level1.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
          {
            level: 2,
            format: LevelFormat.DECIMAL,
            text: "%3.",
            alignment: AlignmentType.START,
            style: {
              paragraph: {
                indent: {
                  left: pixelsToTwips(merged.numberedList.level2.textIndent),
                  hanging: pixelsToTwips(
                    merged.numberedList.level2.textIndent -
                      merged.numberedList.level2.markerIndent,
                  ),
                },
                spacing: {
                  before: 0,
                  after: 0,
                  line: lineHeightToWordSpacing(lineHeight),
                },
              },
            },
          },
        ],
      },
    ],
  };
}

export function getPagePropertiesFromWordConfig(
  wordConfig: WordSpecificConfig = DEFAULT_WORD_SPECIFIC_CONFIG,
): ISectionPropertiesOptions {
  const margins = {
    ...DEFAULT_WORD_SPECIFIC_CONFIG.page!.margins,
    ...wordConfig.page?.margins,
  };

  const orientation = wordConfig.page?.orientation ??
    DEFAULT_WORD_SPECIFIC_CONFIG.page!.orientation!;

  return {
    page: {
      size: {
        orientation,
      },
      margin: {
        top: convertInchesToTwip(margins.top!),
        bottom: convertInchesToTwip(margins.bottom!),
        left: convertInchesToTwip(margins.left!),
        right: convertInchesToTwip(margins.right!),
      },
    },
  };
}

export function createFooterFromWordConfig(
  wordConfig: WordSpecificConfig = DEFAULT_WORD_SPECIFIC_CONFIG,
): Footer | undefined {
  const footerConfig = {
    ...DEFAULT_WORD_SPECIFIC_CONFIG.footer,
    ...wordConfig.footer,
  };

  if (!footerConfig.showPageNumbers) {
    return undefined;
  }

  return new Footer({
    children: [
      new Paragraph({
        alignment: footerConfig.alignment!,
        spacing: {
          before: 0,
          after: 0,
        },
        children: [
          new TextRun({
            size: footerConfig.fontSize!,
            children: footerConfig.format === "current_of_total"
              ? [PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES]
              : [PageNumber.CURRENT],
          }),
        ],
      }),
    ],
  });
}

export function getLinkColorFromMerged(merged: MergedMarkdownStyle): string {
  return typeof merged.link.color === "string" ? merged.link.color : "#0000FF";
}
