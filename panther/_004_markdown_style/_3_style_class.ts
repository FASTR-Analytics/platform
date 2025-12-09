// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DefaultMarkdownStyle,
  getDefaultMarkdownStyle,
} from "./_1_default_markdown_style.ts";
import {
  type CustomMarkdownStyleOptions,
  getGlobalMarkdownStyle,
} from "./_2_custom_markdown_style_options.ts";
import type { MergedMarkdownStyle } from "./_3_merged_style_return_types.ts";
import {
  type FontInfo,
  getBaseText,
  getBaseTextInfo,
  getColor,
  getFontsToRegister,
  getTextInfo,
  getTextInfoForSpecialHeadings,
  m,
  type TextInfo,
} from "./deps.ts";
import {
  mergeListLevelEm,
  mergeListMarginEm,
  mergeMarginEm,
} from "./helpers.ts";
import { MARKDOWN_TEXT_STYLE_KEYS } from "./text_style_keys.ts";

export class CustomMarkdownStyle {
  private _d: DefaultMarkdownStyle;
  private _g: CustomMarkdownStyleOptions;
  private _c: CustomMarkdownStyleOptions;
  private _sf: number;
  private _baseText: TextInfo;

  constructor(
    customStyle: CustomMarkdownStyleOptions | undefined,
    responsiveScale?: number,
  ) {
    this._d = getDefaultMarkdownStyle();
    this._g = getGlobalMarkdownStyle();
    this._c = customStyle ?? {};
    this._sf = (this._c?.scale ?? this._g?.scale ?? this._d.scale) *
      (responsiveScale ?? 1);
    this._baseText = getBaseTextInfo(
      this._c.text?.base,
      this._g.text?.base,
      getBaseText(),
      this._sf,
    );
  }

  getMergedMarkdownStyle(): MergedMarkdownStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;

    // Resolve all text styles first (these include scale factor in fontSize)
    const paragraphText = getTextInfo(
      c.text?.paragraph,
      g.text?.paragraph,
      baseText,
    );
    const h1Text = getTextInfoForSpecialHeadings(
      c.text?.h1,
      g.text?.h1,
      d.headingRelFontSizes.h1,
      baseText,
    );
    const h2Text = getTextInfoForSpecialHeadings(
      c.text?.h2,
      g.text?.h2,
      d.headingRelFontSizes.h2,
      baseText,
    );
    const h3Text = getTextInfoForSpecialHeadings(
      c.text?.h3,
      g.text?.h3,
      d.headingRelFontSizes.h3,
      baseText,
    );
    const h4Text = getTextInfo(c.text?.h4, g.text?.h4, baseText);
    const h5Text = getTextInfo(c.text?.h5, g.text?.h5, baseText);
    const h6Text = getTextInfo(c.text?.h6, g.text?.h6, baseText);
    const listText = getTextInfo(c.text?.list, g.text?.list, baseText);
    const blockquoteText = getTextInfo(
      c.text?.blockquote,
      g.text?.blockquote,
      baseText,
    );
    const codeText = getTextInfo(c.text?.code, g.text?.code, baseText);

    return {
      alreadyScaledValue: sf,
      text: {
        paragraph: paragraphText,
        h1: h1Text,
        h2: h2Text,
        h3: h3Text,
        h4: h4Text,
        h5: h5Text,
        h6: h6Text,
        list: listText,
        blockquote: blockquoteText,
        code: codeText,
      },
      margins: {
        paragraph: mergeMarginEm(
          c.marginsEm?.paragraph,
          g.marginsEm?.paragraph,
          d.marginsEm.paragraph,
          paragraphText.fontSize,
        ),
        h1: mergeMarginEm(
          c.marginsEm?.h1,
          g.marginsEm?.h1,
          d.marginsEm.h1,
          h1Text.fontSize,
        ),
        h2: mergeMarginEm(
          c.marginsEm?.h2,
          g.marginsEm?.h2,
          d.marginsEm.h2,
          h2Text.fontSize,
        ),
        h3: mergeMarginEm(
          c.marginsEm?.h3,
          g.marginsEm?.h3,
          d.marginsEm.h3,
          h3Text.fontSize,
        ),
        h4: mergeMarginEm(
          c.marginsEm?.h4,
          g.marginsEm?.h4,
          d.marginsEm.h4,
          h4Text.fontSize,
        ),
        h5: mergeMarginEm(
          c.marginsEm?.h5,
          g.marginsEm?.h5,
          d.marginsEm.h5,
          h5Text.fontSize,
        ),
        h6: mergeMarginEm(
          c.marginsEm?.h6,
          g.marginsEm?.h6,
          d.marginsEm.h6,
          h6Text.fontSize,
        ),
        list: mergeListMarginEm(
          c.marginsEm?.list,
          g.marginsEm?.list,
          d.marginsEm.list,
          listText.fontSize,
        ),
        image: mergeMarginEm(
          c.marginsEm?.image,
          g.marginsEm?.image,
          d.marginsEm.image,
          baseText.fontSize,
        ),
        table: mergeMarginEm(
          c.marginsEm?.table,
          g.marginsEm?.table,
          d.marginsEm.table,
          baseText.fontSize,
        ),
        blockquote: mergeMarginEm(
          c.marginsEm?.blockquote,
          g.marginsEm?.blockquote,
          d.marginsEm.blockquote,
          blockquoteText.fontSize,
        ),
        horizontalRule: mergeMarginEm(
          c.marginsEm?.horizontalRule,
          g.marginsEm?.horizontalRule,
          d.marginsEm.horizontalRule,
          baseText.fontSize,
        ),
        code: mergeMarginEm(
          c.marginsEm?.code,
          g.marginsEm?.code,
          d.marginsEm.code,
          codeText.fontSize,
        ),
      },
      bulletList: {
        level0: mergeListLevelEm(
          c.bulletList?.level0,
          g.bulletList?.level0,
          d.bulletList.level0,
          listText.fontSize,
        ),
        level1: mergeListLevelEm(
          c.bulletList?.level1,
          g.bulletList?.level1,
          d.bulletList.level1,
          listText.fontSize,
        ),
        level2: mergeListLevelEm(
          c.bulletList?.level2,
          g.bulletList?.level2,
          d.bulletList.level2,
          listText.fontSize,
        ),
      },
      numberedList: {
        level0: mergeListLevelEm(
          c.numberedList?.level0,
          g.numberedList?.level0,
          d.numberedList.level0,
          listText.fontSize,
        ),
        level1: mergeListLevelEm(
          c.numberedList?.level1,
          g.numberedList?.level1,
          d.numberedList.level1,
          listText.fontSize,
        ),
        level2: mergeListLevelEm(
          c.numberedList?.level2,
          g.numberedList?.level2,
          d.numberedList.level2,
          listText.fontSize,
        ),
      },
      blockquote: {
        leftBorderWidth: m(
          c.blockquote?.leftBorderWidth,
          g.blockquote?.leftBorderWidth,
          d.blockquote.leftBorderWidth,
        ),
        leftBorderColor: getColor(
          m(
            c.blockquote?.leftBorderColor,
            g.blockquote?.leftBorderColor,
            d.blockquote.leftBorderColor,
          ),
        ),
        paddingTop: m(
          c.blockquote?.paddingEm?.top,
          g.blockquote?.paddingEm?.top,
          d.blockquote.paddingEm.top,
        ) * blockquoteText.fontSize,
        paddingBottom: m(
          c.blockquote?.paddingEm?.bottom,
          g.blockquote?.paddingEm?.bottom,
          d.blockquote.paddingEm.bottom,
        ) * blockquoteText.fontSize,
        paddingLeft: m(
          c.blockquote?.paddingEm?.left,
          g.blockquote?.paddingEm?.left,
          d.blockquote.paddingEm.left,
        ) * blockquoteText.fontSize,
        paddingRight: m(
          c.blockquote?.paddingEm?.right,
          g.blockquote?.paddingEm?.right,
          d.blockquote.paddingEm.right,
        ) * blockquoteText.fontSize,
        paragraphGap: m(
          c.blockquote?.paragraphGapEm,
          g.blockquote?.paragraphGapEm,
          d.blockquote.paragraphGapEm,
        ) * blockquoteText.fontSize,
        align: m(c.blockquote?.align, g.blockquote?.align, d.blockquote.align),
        backgroundColor: getColor(
          m(
            c.blockquote?.backgroundColor,
            g.blockquote?.backgroundColor,
            d.blockquote.backgroundColor,
          ),
        ),
      },
      code: {
        backgroundColor: getColor(
          m(
            c.code?.backgroundColor,
            g.code?.backgroundColor,
            d.code.backgroundColor,
          ),
        ),
        paddingHorizontal: m(
          c.code?.paddingEm?.horizontal,
          g.code?.paddingEm?.horizontal,
          d.code.paddingEm.horizontal,
        ) * codeText.fontSize,
        paddingVertical: m(
          c.code?.paddingEm?.vertical,
          g.code?.paddingEm?.vertical,
          d.code.paddingEm.vertical,
        ) * codeText.fontSize,
      },
      horizontalRule: {
        strokeWidth: m(
          c.horizontalRule?.strokeWidth,
          g.horizontalRule?.strokeWidth,
          d.horizontalRule.strokeWidth,
        ),
        strokeColor: getColor(
          m(
            c.horizontalRule?.strokeColor,
            g.horizontalRule?.strokeColor,
            d.horizontalRule.strokeColor,
          ),
        ),
      },
      link: {
        color: getColor(m(c.link?.color, g.link?.color, d.link.color)),
        underline: m(c.link?.underline, g.link?.underline, d.link.underline),
      },
      image: {
        defaultAspectRatio: m(
          c.image?.defaultAspectRatio,
          g.image?.defaultAspectRatio,
          d.image.defaultAspectRatio,
        ),
      },
      table: {
        borderWidth: m(
          c.table?.border?.width,
          g.table?.border?.width,
          d.table.border.width,
        ),
        borderColor: getColor(
          m(
            c.table?.border?.color,
            g.table?.border?.color,
            d.table.border.color,
          ),
        ),
        borderStyle: m(
          c.table?.border?.style,
          g.table?.border?.style,
          d.table.border.style,
        ),
        cellPaddingHorizontal: m(
          c.table?.cellPaddingEm?.horizontal,
          g.table?.cellPaddingEm?.horizontal,
          d.table.cellPaddingEm.horizontal,
        ) * baseText.fontSize,
        cellPaddingVertical: m(
          c.table?.cellPaddingEm?.vertical,
          g.table?.cellPaddingEm?.vertical,
          d.table.cellPaddingEm.vertical,
        ) * baseText.fontSize,
        headerShadingColor: getColor(
          m(
            c.table?.headerShading?.color,
            g.table?.headerShading?.color,
            d.table.headerShading.color,
          ),
        ),
        headerShadingOpacity: m(
          c.table?.headerShading?.opacity,
          g.table?.headerShading?.opacity,
          d.table.headerShading.opacity,
        ),
      },
      math: {
        displayAlign: m(
          c.math?.displayAlign,
          g.math?.displayAlign,
          d.math.displayAlign,
        ),
      },
    };
  }

  getFontsToRegister(): FontInfo[] {
    return getFontsToRegister(
      MARKDOWN_TEXT_STYLE_KEYS,
      this._c.text,
      this._g.text,
      getBaseText().font,
    );
  }

  getEmValues(): {
    margins: {
      paragraph: { top: number; bottom: number };
      h1: { top: number; bottom: number };
      h2: { top: number; bottom: number };
      h3: { top: number; bottom: number };
      h4: { top: number; bottom: number };
      h5: { top: number; bottom: number };
      h6: { top: number; bottom: number };
      list: { top: number; bottom: number; gap: number };
      image: { top: number; bottom: number };
      table: { top: number; bottom: number };
      blockquote: { top: number; bottom: number };
      horizontalRule: { top: number; bottom: number };
      code: { top: number; bottom: number };
    };
    list: {
      bullet: { indent: number; gap: number };
      numbered: { indent: number; gap: number };
    };
    blockquote: {
      paddingTop: number;
      paddingBottom: number;
      paddingLeft: number;
      paddingRight: number;
      paragraphGap: number;
    };
    code: { my: number; paddingH: number; paddingV: number };
    hr: { my: number };
    table: { cellPaddingH: number; cellPaddingV: number };
  } {
    const c = this._c;
    const g = this._g;
    const d = this._d;

    return {
      margins: {
        paragraph: {
          top: m(
            c.marginsEm?.paragraph?.top,
            g.marginsEm?.paragraph?.top,
            d.marginsEm.paragraph.top,
          ),
          bottom: m(
            c.marginsEm?.paragraph?.bottom,
            g.marginsEm?.paragraph?.bottom,
            d.marginsEm.paragraph.bottom,
          ),
        },
        h1: {
          top: m(
            c.marginsEm?.h1?.top,
            g.marginsEm?.h1?.top,
            d.marginsEm.h1.top,
          ),
          bottom: m(
            c.marginsEm?.h1?.bottom,
            g.marginsEm?.h1?.bottom,
            d.marginsEm.h1.bottom,
          ),
        },
        h2: {
          top: m(
            c.marginsEm?.h2?.top,
            g.marginsEm?.h2?.top,
            d.marginsEm.h2.top,
          ),
          bottom: m(
            c.marginsEm?.h2?.bottom,
            g.marginsEm?.h2?.bottom,
            d.marginsEm.h2.bottom,
          ),
        },
        h3: {
          top: m(
            c.marginsEm?.h3?.top,
            g.marginsEm?.h3?.top,
            d.marginsEm.h3.top,
          ),
          bottom: m(
            c.marginsEm?.h3?.bottom,
            g.marginsEm?.h3?.bottom,
            d.marginsEm.h3.bottom,
          ),
        },
        h4: {
          top: m(
            c.marginsEm?.h4?.top,
            g.marginsEm?.h4?.top,
            d.marginsEm.h4.top,
          ),
          bottom: m(
            c.marginsEm?.h4?.bottom,
            g.marginsEm?.h4?.bottom,
            d.marginsEm.h4.bottom,
          ),
        },
        h5: {
          top: m(
            c.marginsEm?.h5?.top,
            g.marginsEm?.h5?.top,
            d.marginsEm.h5.top,
          ),
          bottom: m(
            c.marginsEm?.h5?.bottom,
            g.marginsEm?.h5?.bottom,
            d.marginsEm.h5.bottom,
          ),
        },
        h6: {
          top: m(
            c.marginsEm?.h6?.top,
            g.marginsEm?.h6?.top,
            d.marginsEm.h6.top,
          ),
          bottom: m(
            c.marginsEm?.h6?.bottom,
            g.marginsEm?.h6?.bottom,
            d.marginsEm.h6.bottom,
          ),
        },
        list: {
          top: m(
            c.marginsEm?.list?.top,
            g.marginsEm?.list?.top,
            d.marginsEm.list.top,
          ),
          bottom: m(
            c.marginsEm?.list?.bottom,
            g.marginsEm?.list?.bottom,
            d.marginsEm.list.bottom,
          ),
          gap: m(
            c.marginsEm?.list?.gap,
            g.marginsEm?.list?.gap,
            d.marginsEm.list.gap,
          ),
        },
        blockquote: {
          top: m(
            c.marginsEm?.blockquote?.top,
            g.marginsEm?.blockquote?.top,
            d.marginsEm.blockquote.top,
          ),
          bottom: m(
            c.marginsEm?.blockquote?.bottom,
            g.marginsEm?.blockquote?.bottom,
            d.marginsEm.blockquote.bottom,
          ),
        },
        horizontalRule: {
          top: m(
            c.marginsEm?.horizontalRule?.top,
            g.marginsEm?.horizontalRule?.top,
            d.marginsEm.horizontalRule.top,
          ),
          bottom: m(
            c.marginsEm?.horizontalRule?.bottom,
            g.marginsEm?.horizontalRule?.bottom,
            d.marginsEm.horizontalRule.bottom,
          ),
        },
        code: {
          top: m(
            c.marginsEm?.code?.top,
            g.marginsEm?.code?.top,
            d.marginsEm.code.top,
          ),
          bottom: m(
            c.marginsEm?.code?.bottom,
            g.marginsEm?.code?.bottom,
            d.marginsEm.code.bottom,
          ),
        },
        image: {
          top: m(
            c.marginsEm?.image?.top,
            g.marginsEm?.image?.top,
            d.marginsEm.image.top,
          ),
          bottom: m(
            c.marginsEm?.image?.bottom,
            g.marginsEm?.image?.bottom,
            d.marginsEm.image.bottom,
          ),
        },
        table: {
          top: m(
            c.marginsEm?.table?.top,
            g.marginsEm?.table?.top,
            d.marginsEm.table.top,
          ),
          bottom: m(
            c.marginsEm?.table?.bottom,
            g.marginsEm?.table?.bottom,
            d.marginsEm.table.bottom,
          ),
        },
      },
      list: {
        bullet: {
          indent: m(
            c.bulletList?.level0?.textIndentEm,
            g.bulletList?.level0?.textIndentEm,
            d.bulletList.level0.textIndentEm,
          ),
          gap: m(
            c.marginsEm?.list?.gap,
            g.marginsEm?.list?.gap,
            d.marginsEm.list.gap,
          ),
        },
        numbered: {
          indent: m(
            c.numberedList?.level0?.textIndentEm,
            g.numberedList?.level0?.textIndentEm,
            d.numberedList.level0.textIndentEm,
          ),
          gap: m(
            c.marginsEm?.list?.gap,
            g.marginsEm?.list?.gap,
            d.marginsEm.list.gap,
          ),
        },
      },
      blockquote: {
        paddingTop: m(
          c.blockquote?.paddingEm?.top,
          g.blockquote?.paddingEm?.top,
          d.blockquote.paddingEm.top,
        ),
        paddingBottom: m(
          c.blockquote?.paddingEm?.bottom,
          g.blockquote?.paddingEm?.bottom,
          d.blockquote.paddingEm.bottom,
        ),
        paddingLeft: m(
          c.blockquote?.paddingEm?.left,
          g.blockquote?.paddingEm?.left,
          d.blockquote.paddingEm.left,
        ),
        paddingRight: m(
          c.blockquote?.paddingEm?.right,
          g.blockquote?.paddingEm?.right,
          d.blockquote.paddingEm.right,
        ),
        paragraphGap: m(
          c.blockquote?.paragraphGapEm,
          g.blockquote?.paragraphGapEm,
          d.blockquote.paragraphGapEm,
        ),
      },
      code: {
        my: m(
          c.marginsEm?.code?.top,
          g.marginsEm?.code?.top,
          d.marginsEm.code.top,
        ),
        paddingH: m(
          c.code?.paddingEm?.horizontal,
          g.code?.paddingEm?.horizontal,
          d.code.paddingEm.horizontal,
        ),
        paddingV: m(
          c.code?.paddingEm?.vertical,
          g.code?.paddingEm?.vertical,
          d.code.paddingEm.vertical,
        ),
      },
      hr: {
        my: m(
          c.marginsEm?.horizontalRule?.top,
          g.marginsEm?.horizontalRule?.top,
          d.marginsEm.horizontalRule.top,
        ),
      },
      table: {
        cellPaddingH: m(
          c.table?.cellPaddingEm?.horizontal,
          g.table?.cellPaddingEm?.horizontal,
          d.table.cellPaddingEm.horizontal,
        ),
        cellPaddingV: m(
          c.table?.cellPaddingEm?.vertical,
          g.table?.cellPaddingEm?.vertical,
          d.table.cellPaddingEm.vertical,
        ),
      },
    };
  }
}
