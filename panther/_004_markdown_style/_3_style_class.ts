// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DefaultMarkdownStyle,
  getDefaultMarkdownStyle,
  type MarkdownTextStyle,
} from "./_1_default_markdown_style.ts";
import {
  type CustomMarkdownStyleOptions,
  type CustomMarkdownTextStyleOptions,
  getGlobalMarkdownStyle,
} from "./_2_custom_markdown_style_options.ts";
import type {
  MergedMarkdownBlockquoteStyle,
  MergedMarkdownHorizontalRuleStyle,
  MergedMarkdownLinkStyle,
  MergedMarkdownListLevelStyle,
  MergedMarkdownListStyle,
  MergedMarkdownSpacingStyle,
  MergedMarkdownStyle,
  MergedMarkdownTextStyle,
} from "./_3_merged_style_return_types.ts";
import { m, ms } from "./helpers.ts";

export class CustomMarkdownStyle {
  private _d: DefaultMarkdownStyle;
  private _g: CustomMarkdownStyleOptions;
  private _c: CustomMarkdownStyleOptions;
  private _sf: number;

  constructor(
    customStyle?: CustomMarkdownStyleOptions,
    responsiveScale?: number,
  ) {
    this._d = getDefaultMarkdownStyle();
    this._g = getGlobalMarkdownStyle();
    this._c = customStyle ?? {};
    this._sf = (this._c?.scale ?? this._g?.scale ?? this._d.scale) *
      (responsiveScale ?? 1);
  }

  getMergedMarkdownStyle(): MergedMarkdownStyle {
    const sf = this._sf;
    const c = this._c;
    const g = this._g;
    const d = this._d;

    return {
      paragraph: this._mergeTextStyle(
        c.paragraph,
        g.paragraph,
        d.paragraph,
        sf,
      ),
      h1: this._mergeTextStyle(c.h1, g.h1, d.h1, sf),
      h2: this._mergeTextStyle(c.h2, g.h2, d.h2, sf),
      h3: this._mergeTextStyle(c.h3, g.h3, d.h3, sf),
      h4: this._mergeTextStyle(c.h4, g.h4, d.h4, sf),
      h5: this._mergeTextStyle(c.h5, g.h5, d.h5, sf),
      h6: this._mergeTextStyle(c.h6, g.h6, d.h6, sf),
      bulletList: this._mergeListStyle(
        c.bulletList,
        g.bulletList,
        d.bulletList,
        sf,
      ),
      numberedList: this._mergeListStyle(
        c.numberedList,
        g.numberedList,
        d.numberedList,
        sf,
      ),
      blockquote: this._mergeBlockquoteStyle(
        c.blockquote,
        g.blockquote,
        d.blockquote,
        sf,
      ),
      horizontalRule: this._mergeHorizontalRuleStyle(
        c.horizontalRule,
        g.horizontalRule,
        d.horizontalRule,
        sf,
      ),
      link: this._mergeLinkStyle(c.link, g.link, d.link),
      spacing: this._mergeSpacingStyle(c.spacing, g.spacing, d.spacing, sf),
    };
  }

  private _mergeTextStyle(
    c: CustomMarkdownTextStyleOptions | undefined,
    g: CustomMarkdownTextStyleOptions | undefined,
    d: MarkdownTextStyle,
    sf: number,
  ): MergedMarkdownTextStyle {
    return {
      font: m(c?.font, g?.font, d.font),
      fontSize: ms(sf, c?.fontSize, g?.fontSize, d.fontSize),
      color: m(c?.color, g?.color, d.color),
      lineHeight: m(c?.lineHeight, g?.lineHeight, d.lineHeight),
      fontVariants: m(c?.fontVariants, g?.fontVariants, d.fontVariants),
      align: m(c?.align, g?.align, d.align ?? "left"),
      marginTop: ms(sf, c?.marginTop, g?.marginTop, d.marginTop ?? 0),
      marginBottom: ms(
        sf,
        c?.marginBottom,
        g?.marginBottom,
        d.marginBottom ?? 0,
      ),
    };
  }

  private _mergeListStyle(
    c: CustomMarkdownStyleOptions["bulletList"],
    g: CustomMarkdownStyleOptions["bulletList"],
    d: DefaultMarkdownStyle["bulletList"],
    sf: number,
  ): MergedMarkdownListStyle {
    return {
      text: this._mergeTextStyle(c?.text, g?.text, d.text, sf),
      level0: this._mergeListLevelStyle(c?.level0, g?.level0, d.level0, sf),
      level1: this._mergeListLevelStyle(c?.level1, g?.level1, d.level1, sf),
      level2: this._mergeListLevelStyle(c?.level2, g?.level2, d.level2, sf),
    };
  }

  private _mergeListLevelStyle(
    c:
      | { marker?: string; markerIndent?: number; textIndent?: number }
      | undefined,
    g:
      | { marker?: string; markerIndent?: number; textIndent?: number }
      | undefined,
    d: { marker: string; markerIndent: number; textIndent: number },
    sf: number,
  ): MergedMarkdownListLevelStyle {
    return {
      marker: m(c?.marker, g?.marker, d.marker),
      markerIndent: ms(sf, c?.markerIndent, g?.markerIndent, d.markerIndent),
      textIndent: ms(sf, c?.textIndent, g?.textIndent, d.textIndent),
    };
  }

  private _mergeBlockquoteStyle(
    c: CustomMarkdownStyleOptions["blockquote"],
    g: CustomMarkdownStyleOptions["blockquote"],
    d: DefaultMarkdownStyle["blockquote"],
    sf: number,
  ): MergedMarkdownBlockquoteStyle {
    return {
      text: this._mergeTextStyle(c?.text, g?.text, d.text, sf),
      leftBorderWidth: ms(
        sf,
        c?.leftBorderWidth,
        g?.leftBorderWidth,
        d.leftBorderWidth,
      ),
      leftBorderColor: m(
        c?.leftBorderColor,
        g?.leftBorderColor,
        d.leftBorderColor,
      ),
      leftIndent: ms(sf, c?.leftIndent, g?.leftIndent, d.leftIndent),
      backgroundColor: m(
        c?.backgroundColor,
        g?.backgroundColor,
        d.backgroundColor,
      ),
    };
  }

  private _mergeHorizontalRuleStyle(
    c: CustomMarkdownStyleOptions["horizontalRule"],
    g: CustomMarkdownStyleOptions["horizontalRule"],
    d: DefaultMarkdownStyle["horizontalRule"],
    sf: number,
  ): MergedMarkdownHorizontalRuleStyle {
    return {
      strokeWidth: ms(sf, c?.strokeWidth, g?.strokeWidth, d.strokeWidth),
      strokeColor: m(c?.strokeColor, g?.strokeColor, d.strokeColor),
      marginTop: ms(sf, c?.marginTop, g?.marginTop, d.marginTop),
      marginBottom: ms(sf, c?.marginBottom, g?.marginBottom, d.marginBottom),
    };
  }

  private _mergeLinkStyle(
    c: CustomMarkdownStyleOptions["link"],
    g: CustomMarkdownStyleOptions["link"],
    d: DefaultMarkdownStyle["link"],
  ): MergedMarkdownLinkStyle {
    return {
      color: m(c?.color, g?.color, d.color),
      underline: m(c?.underline, g?.underline, d.underline),
    };
  }

  private _mergeSpacingStyle(
    c: CustomMarkdownStyleOptions["spacing"],
    g: CustomMarkdownStyleOptions["spacing"],
    d: DefaultMarkdownStyle["spacing"],
    sf: number,
  ): MergedMarkdownSpacingStyle {
    return {
      paragraphGap: ms(sf, c?.paragraphGap, g?.paragraphGap, d.paragraphGap),
      listItemGap: ms(sf, c?.listItemGap, g?.listItemGap, d.listItemGap),
      nestedListIndent: ms(
        sf,
        c?.nestedListIndent,
        g?.nestedListIndent,
        d.nestedListIndent,
      ),
    };
  }
}
