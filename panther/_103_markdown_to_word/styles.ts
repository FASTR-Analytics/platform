// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  AlignmentType,
  convertInchesToTwip,
  Footer,
  LevelFormat,
  PageNumber,
  Paragraph,
  TextRun,
} from "./deps.ts";
import type {
  INumberingOptions,
  ISectionPropertiesOptions,
  IStylesOptions,
} from "./deps.ts";
import { STYLE_CONFIG, type StyleConfig } from "./style_config.ts";

export const createStyles = (
  config: StyleConfig = STYLE_CONFIG,
): IStylesOptions => ({
  default: {
    document: {
      run: {
        font: config.document.font,
        size: config.document.fontSize,
        color: config.document.color,
      },
      paragraph: {
        spacing: {
          line: config.document.lineSpacing,
          before: config.document.paragraphSpaceBefore,
          after: config.document.paragraphSpaceAfter,
        },
      },
    },
    heading1: {
      run: {
        font: config.headings.h1.font,
        size: config.headings.h1.size,
        bold: config.headings.h1.bold,
        color: config.headings.h1.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h1.spaceBefore,
          after: config.headings.h1.spaceAfter,
        },
      },
    },
    heading2: {
      run: {
        font: config.headings.h2.font,
        size: config.headings.h2.size,
        bold: config.headings.h2.bold,
        color: config.headings.h2.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h2.spaceBefore,
          after: config.headings.h2.spaceAfter,
        },
      },
    },
    heading3: {
      run: {
        font: config.headings.h3.font,
        size: config.headings.h3.size,
        bold: config.headings.h3.bold,
        color: config.headings.h3.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h3.spaceBefore,
          after: config.headings.h3.spaceAfter,
        },
      },
    },
    heading4: {
      run: {
        font: config.headings.h4.font,
        size: config.headings.h4.size,
        bold: config.headings.h4.bold,
        color: config.headings.h4.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h4.spaceBefore,
          after: config.headings.h4.spaceAfter,
        },
      },
    },
    heading5: {
      run: {
        font: config.headings.h5.font,
        size: config.headings.h5.size,
        bold: config.headings.h5.bold,
        color: config.headings.h5.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h5.spaceBefore,
          after: config.headings.h5.spaceAfter,
        },
      },
    },
    heading6: {
      run: {
        font: config.headings.h6.font,
        size: config.headings.h6.size,
        bold: config.headings.h6.bold,
        color: config.headings.h6.color,
      },
      paragraph: {
        spacing: {
          before: config.headings.h6.spaceBefore,
          after: config.headings.h6.spaceAfter,
        },
      },
    },
  },
});

export const createNumbering = (
  config: StyleConfig = STYLE_CONFIG,
): INumberingOptions => ({
  config: [
    {
      reference: "bullets",
      levels: [
        // Level 0
        // Note: spacing.after is for spacing BETWEEN items within a list.
        // Additional spacing after the entire list (to next paragraph) is handled
        // separately in word_builder.ts via paragraph-level override on the last item.
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: config.list.level0.bulletSymbol,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level0.indent),
                hanging: convertInchesToTwip(config.list.level0.hanging),
              },
              spacing: {
                before: config.list.level0.spaceBefore,
                after: config.list.level0.spaceAfter,
                line: config.list.level0.lineSpacing,
              },
            },
          },
        },
        // Level 1
        {
          level: 1,
          format: LevelFormat.BULLET,
          text: config.list.level1.bulletSymbol,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level1.indent),
                hanging: convertInchesToTwip(config.list.level1.hanging),
              },
              spacing: {
                before: config.list.level1.spaceBefore,
                after: config.list.level1.spaceAfter,
                line: config.list.level1.lineSpacing,
              },
            },
          },
        },
        // Level 2
        {
          level: 2,
          format: LevelFormat.BULLET,
          text: config.list.level2.bulletSymbol,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level2.indent),
                hanging: convertInchesToTwip(config.list.level2.hanging),
              },
              spacing: {
                before: config.list.level2.spaceBefore,
                after: config.list.level2.spaceAfter,
                line: config.list.level2.lineSpacing,
              },
            },
          },
        },
      ],
    },
    {
      reference: "numbering",
      levels: [
        // Level 0
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: config.list.level0.numberFormat,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level0.indent),
                hanging: convertInchesToTwip(config.list.level0.hanging),
              },
              spacing: {
                before: config.list.level0.spaceBefore,
                after: config.list.level0.spaceAfter,
                line: config.list.level0.lineSpacing,
              },
            },
          },
        },
        // Level 1
        {
          level: 1,
          format: LevelFormat.DECIMAL,
          text: config.list.level1.numberFormat,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level1.indent),
                hanging: convertInchesToTwip(config.list.level1.hanging),
              },
              spacing: {
                before: config.list.level1.spaceBefore,
                after: config.list.level1.spaceAfter,
                line: config.list.level1.lineSpacing,
              },
            },
          },
        },
        // Level 2
        {
          level: 2,
          format: LevelFormat.DECIMAL,
          text: config.list.level2.numberFormat,
          alignment: AlignmentType.START,
          style: {
            paragraph: {
              indent: {
                left: convertInchesToTwip(config.list.level2.indent),
                hanging: convertInchesToTwip(config.list.level2.hanging),
              },
              spacing: {
                before: config.list.level2.spaceBefore,
                after: config.list.level2.spaceAfter,
                line: config.list.level2.lineSpacing,
              },
            },
          },
        },
      ],
    },
  ],
});

export function getPageProperties(
  config: StyleConfig = STYLE_CONFIG,
): ISectionPropertiesOptions {
  return {
    page: {
      size: {
        orientation: config.page.orientation,
      },
      margin: {
        top: convertInchesToTwip(config.page.margins.top),
        bottom: convertInchesToTwip(config.page.margins.bottom),
        left: convertInchesToTwip(config.page.margins.left),
        right: convertInchesToTwip(config.page.margins.right),
      },
    },
  };
}

export function createFooter(
  config: StyleConfig = STYLE_CONFIG,
): Footer | undefined {
  if (!config.footer.showPageNumbers) {
    return undefined;
  }

  return new Footer({
    children: [
      new Paragraph({
        alignment: config.footer.alignment,
        spacing: {
          before: 0,
          after: 0,
        },
        children: [
          new TextRun({
            size: config.footer.fontSize,
            children: config.footer.format === "current_of_total"
              ? [PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES]
              : [PageNumber.CURRENT],
          }),
        ],
      }),
    ],
  });
}

export function getLinkColor(config: StyleConfig = STYLE_CONFIG): string {
  return config.link.color;
}
