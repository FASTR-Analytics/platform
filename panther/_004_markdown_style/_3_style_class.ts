// Copyright 2023-2026, Tim Roberton, All rights reserved.
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
import { MARKDOWN_TEXT_STYLE_KEYS } from "./text_style_keys.ts";

// The resolved markdown style, expressed in em (font-relative units). This is
// the single source of truth for the custom→global→default cascade of every
// font-relative metric. Both consumers derive from it:
//   - getEmValues()           → the em projection (HTML hands em to CSS)
//   - getMergedMarkdownStyle() → the px projection (em × fontSize, eager for
//                                Canvas/PDF/Word) plus the absolute properties.
// Keeping one cascade makes Canvas/HTML divergence structurally impossible.
type EmMargin = { top: number; bottom: number };
type EmListMargin = EmMargin & { gap: number };
type EmListLevel = { markerIndentEm: number; textIndentEm: number };

type ResolvedMarkdownMetricsEm = {
  margins: {
    paragraph: EmMargin;
    h1: EmMargin;
    h2: EmMargin;
    h3: EmMargin;
    h4: EmMargin;
    h5: EmMargin;
    h6: EmMargin;
    list: EmListMargin;
    image: EmMargin;
    table: EmMargin;
    blockquote: EmMargin; // block spacing — distinct from `blockquote` paddings
    horizontalRule: EmMargin;
    code: EmMargin;
  };
  blockquote: {
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paragraphGap: number;
  };
  code: { paddingH: number; paddingV: number };
  table: { cellPaddingH: number; cellPaddingV: number };
  bulletList: { level0: EmListLevel; level1: EmListLevel; level2: EmListLevel };
  numberedList: {
    level0: EmListLevel;
    level1: EmListLevel;
    level2: EmListLevel;
  };
};

export class CustomMarkdownStyle {
  private _d: DefaultMarkdownStyle;
  private _g: CustomMarkdownStyleOptions;
  private _c: CustomMarkdownStyleOptions;
  private _sf: number;
  private _baseText: TextInfo;

  // fitScale is the shrink-to-fit factor (default 1, set only by shrink-to-fit).
  constructor(
    customStyle: CustomMarkdownStyleOptions | undefined,
    fitScale?: number,
  ) {
    this._d = getDefaultMarkdownStyle();
    this._g = getGlobalMarkdownStyle();
    this._c = customStyle ?? {};
    this._sf = fitScale ?? 1;
    this._baseText = getBaseTextInfo(
      this._c.text?.base,
      this._g.text?.base,
      getBaseText(),
      this._sf,
    );
  }

  // Single cascade walk → all font-relative metrics, in em.
  private resolveEmMetrics(): ResolvedMarkdownMetricsEm {
    const c = this._c;
    const g = this._g;
    const d = this._d;

    const margin = (
      cc: { top?: number; bottom?: number } | undefined,
      gg: { top?: number; bottom?: number } | undefined,
      dd: { top: number; bottom: number },
    ): EmMargin => ({
      top: m(cc?.top, gg?.top, dd.top),
      bottom: m(cc?.bottom, gg?.bottom, dd.bottom),
    });

    const level = (
      cc: { markerIndentEm?: number; textIndentEm?: number } | undefined,
      gg: { markerIndentEm?: number; textIndentEm?: number } | undefined,
      dd: { markerIndentEm: number; textIndentEm: number },
    ): EmListLevel => ({
      markerIndentEm: m(
        cc?.markerIndentEm,
        gg?.markerIndentEm,
        dd.markerIndentEm,
      ),
      textIndentEm: m(cc?.textIndentEm, gg?.textIndentEm, dd.textIndentEm),
    });

    return {
      margins: {
        paragraph: margin(
          c.marginsEm?.paragraph,
          g.marginsEm?.paragraph,
          d.marginsEm.paragraph,
        ),
        h1: margin(c.marginsEm?.h1, g.marginsEm?.h1, d.marginsEm.h1),
        h2: margin(c.marginsEm?.h2, g.marginsEm?.h2, d.marginsEm.h2),
        h3: margin(c.marginsEm?.h3, g.marginsEm?.h3, d.marginsEm.h3),
        h4: margin(c.marginsEm?.h4, g.marginsEm?.h4, d.marginsEm.h4),
        h5: margin(c.marginsEm?.h5, g.marginsEm?.h5, d.marginsEm.h5),
        h6: margin(c.marginsEm?.h6, g.marginsEm?.h6, d.marginsEm.h6),
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
        image: margin(
          c.marginsEm?.image,
          g.marginsEm?.image,
          d.marginsEm.image,
        ),
        table: margin(
          c.marginsEm?.table,
          g.marginsEm?.table,
          d.marginsEm.table,
        ),
        blockquote: margin(
          c.marginsEm?.blockquote,
          g.marginsEm?.blockquote,
          d.marginsEm.blockquote,
        ),
        horizontalRule: margin(
          c.marginsEm?.horizontalRule,
          g.marginsEm?.horizontalRule,
          d.marginsEm.horizontalRule,
        ),
        code: margin(c.marginsEm?.code, g.marginsEm?.code, d.marginsEm.code),
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
      bulletList: {
        level0: level(
          c.bulletList?.level0,
          g.bulletList?.level0,
          d.bulletList.level0,
        ),
        level1: level(
          c.bulletList?.level1,
          g.bulletList?.level1,
          d.bulletList.level1,
        ),
        level2: level(
          c.bulletList?.level2,
          g.bulletList?.level2,
          d.bulletList.level2,
        ),
      },
      numberedList: {
        level0: level(
          c.numberedList?.level0,
          g.numberedList?.level0,
          d.numberedList.level0,
        ),
        level1: level(
          c.numberedList?.level1,
          g.numberedList?.level1,
          d.numberedList.level1,
        ),
        level2: level(
          c.numberedList?.level2,
          g.numberedList?.level2,
          d.numberedList.level2,
        ),
      },
    };
  }

  getMergedMarkdownStyle(): MergedMarkdownStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const baseText = this._baseText;
    const em = this.resolveEmMetrics();

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

    // Project an em margin to px against a given element fontSize.
    const px = (mar: EmMargin, fontSize: number) => ({
      top: mar.top * fontSize,
      bottom: mar.bottom * fontSize,
    });

    // List markers are absolutes (strings); indents are em metrics × list size.
    const mergeLevel = (
      cc: { marker?: string } | undefined,
      gg: { marker?: string } | undefined,
      dd: { marker: string },
      lvl: EmListLevel,
    ) => ({
      marker: m(cc?.marker, gg?.marker, dd.marker),
      markerIndent: lvl.markerIndentEm * listText.fontSize,
      textIndent: lvl.textIndentEm * listText.fontSize,
    });

    return {
      alreadyScaledValue: sf,
      alignH: m(c.alignH, g.alignH, d.alignH),
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
        paragraph: px(em.margins.paragraph, paragraphText.fontSize),
        h1: px(em.margins.h1, h1Text.fontSize),
        h2: px(em.margins.h2, h2Text.fontSize),
        h3: px(em.margins.h3, h3Text.fontSize),
        h4: px(em.margins.h4, h4Text.fontSize),
        h5: px(em.margins.h5, h5Text.fontSize),
        h6: px(em.margins.h6, h6Text.fontSize),
        list: {
          top: em.margins.list.top * listText.fontSize,
          bottom: em.margins.list.bottom * listText.fontSize,
          gap: em.margins.list.gap * listText.fontSize,
        },
        image: px(em.margins.image, baseText.fontSize),
        table: px(em.margins.table, baseText.fontSize),
        blockquote: px(em.margins.blockquote, blockquoteText.fontSize),
        horizontalRule: px(em.margins.horizontalRule, baseText.fontSize),
        code: px(em.margins.code, codeText.fontSize),
      },
      bulletList: {
        level0: mergeLevel(
          c.bulletList?.level0,
          g.bulletList?.level0,
          d.bulletList.level0,
          em.bulletList.level0,
        ),
        level1: mergeLevel(
          c.bulletList?.level1,
          g.bulletList?.level1,
          d.bulletList.level1,
          em.bulletList.level1,
        ),
        level2: mergeLevel(
          c.bulletList?.level2,
          g.bulletList?.level2,
          d.bulletList.level2,
          em.bulletList.level2,
        ),
      },
      numberedList: {
        level0: mergeLevel(
          c.numberedList?.level0,
          g.numberedList?.level0,
          d.numberedList.level0,
          em.numberedList.level0,
        ),
        level1: mergeLevel(
          c.numberedList?.level1,
          g.numberedList?.level1,
          d.numberedList.level1,
          em.numberedList.level1,
        ),
        level2: mergeLevel(
          c.numberedList?.level2,
          g.numberedList?.level2,
          d.numberedList.level2,
          em.numberedList.level2,
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
        paddingTop: em.blockquote.paddingTop * blockquoteText.fontSize,
        paddingBottom: em.blockquote.paddingBottom * blockquoteText.fontSize,
        paddingLeft: em.blockquote.paddingLeft * blockquoteText.fontSize,
        paddingRight: em.blockquote.paddingRight * blockquoteText.fontSize,
        paragraphGap: em.blockquote.paragraphGap * blockquoteText.fontSize,
        alignH: m(
          c.blockquote?.alignH,
          g.blockquote?.alignH,
          d.blockquote.alignH,
        ),
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
        paddingHorizontal: em.code.paddingH * codeText.fontSize,
        paddingVertical: em.code.paddingV * codeText.fontSize,
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
        cellPaddingHorizontal: em.table.cellPaddingH * baseText.fontSize,
        cellPaddingVertical: em.table.cellPaddingV * baseText.fontSize,
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
    // Pure em projection of the resolved metrics — the same cascade the px
    // projection (getMergedMarkdownStyle) uses, just left in em for CSS.
    const em = this.resolveEmMetrics();
    return {
      margins: {
        paragraph: em.margins.paragraph,
        h1: em.margins.h1,
        h2: em.margins.h2,
        h3: em.margins.h3,
        h4: em.margins.h4,
        h5: em.margins.h5,
        h6: em.margins.h6,
        list: em.margins.list,
        image: em.margins.image,
        table: em.margins.table,
        blockquote: em.margins.blockquote,
        horizontalRule: em.margins.horizontalRule,
        code: em.margins.code,
      },
      list: {
        bullet: {
          indent: em.bulletList.level0.textIndentEm,
          gap: em.margins.list.gap,
        },
        numbered: {
          indent: em.numberedList.level0.textIndentEm,
          gap: em.margins.list.gap,
        },
      },
      blockquote: {
        paddingTop: em.blockquote.paddingTop,
        paddingBottom: em.blockquote.paddingBottom,
        paddingLeft: em.blockquote.paddingLeft,
        paddingRight: em.blockquote.paddingRight,
        paragraphGap: em.blockquote.paragraphGap,
      },
      code: {
        my: em.margins.code.top,
        paddingH: em.code.paddingH,
        paddingV: em.code.paddingV,
      },
      hr: {
        my: em.margins.horizontalRule.top,
      },
      table: {
        cellPaddingH: em.table.cellPaddingH,
        cellPaddingV: em.table.cellPaddingV,
      },
    };
  }
}
