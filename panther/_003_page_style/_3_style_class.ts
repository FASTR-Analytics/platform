// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type DefaultPageStyle,
  getDefaultPageStyle,
} from "./_1_default_page_style.ts";
import {
  type CustomPageStyleOptions,
  getGlobalPageStyle,
} from "./_2_custom_page_style_options.ts";
import type { MergedPageStyle } from "./_3_merged_style_return_types.ts";
import { type FontInfo, getFont, Padding, type TextInfo } from "./deps.ts";
import {
  deduplicateFonts,
  getMergedFont,
  getTextInfo,
  m,
  ms,
} from "./helpers.ts";
import { PAGE_TEXT_STYLE_KEYS } from "./text_style_keys.ts";

export class CustomPageStyle {
  private _d: DefaultPageStyle;
  private _g: CustomPageStyleOptions;
  private _c: CustomPageStyleOptions;
  private _sf: number;

  constructor(
    customStyle: CustomPageStyleOptions | undefined,
    responsiveScale?: number,
  ) {
    this._d = getDefaultPageStyle();
    this._g = getGlobalPageStyle();
    this._c = customStyle ?? {};
    this._sf = (this._c?.scale ?? this._g?.scale ?? this._d.scale) *
      (responsiveScale ?? 1);
  }

  baseText(): TextInfo {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    return {
      font: m(c.text?.base?.font, g.text?.base?.font, d.baseText.font),
      fontSize: ms(
        sf,
        c.text?.base?.fontSize,
        g.text?.base?.fontSize,
        d.baseText.fontSize,
      ),
      color: m(c.text?.base?.color, g.text?.base?.color, d.baseText.color),
      lineHeight: m(
        c.text?.base?.lineHeight,
        g.text?.base?.lineHeight,
        d.baseText.lineHeight,
      ),
      lineBreakGap: m(
        c.text?.base?.lineBreakGap,
        g.text?.base?.lineBreakGap,
        d.baseText.lineBreakGap,
      ),
      letterSpacing: m(
        c.text?.base?.letterSpacing,
        g.text?.base?.letterSpacing,
        d.baseText.letterSpacing,
      ),
    };
  }

  getMergedPageStyle(): MergedPageStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this.baseText();

    const mergedStyle: MergedPageStyle = {
      alreadyScaledValue: sf,
      text: {
        coverTitle: getTextInfo(
          c.text?.coverTitle,
          g.text?.coverTitle,
          baseText,
        ),
        coverSubTitle: getTextInfo(
          c.text?.coverSubTitle,
          g.text?.coverSubTitle,
          baseText,
        ),
        coverAuthor: getTextInfo(
          c.text?.coverAuthor,
          g.text?.coverAuthor,
          baseText,
        ),
        coverDate: getTextInfo(c.text?.coverDate, g.text?.coverDate, baseText),
        //
        sectionTitle: getTextInfo(
          c.text?.sectionTitle,
          g.text?.sectionTitle,
          baseText,
        ),
        sectionSubTitle: getTextInfo(
          c.text?.sectionSubTitle,
          g.text?.sectionSubTitle,
          baseText,
        ),
        //
        header: getTextInfo(c.text?.header, g.text?.header, baseText),
        subHeader: getTextInfo(c.text?.subHeader, g.text?.subHeader, baseText),
        date: getTextInfo(c.text?.date, g.text?.date, baseText),
        footer: getTextInfo(c.text?.footer, g.text?.footer, baseText),
        paragraph: getTextInfo(c.text?.paragraph, g.text?.paragraph, baseText),
        pageNumber: getTextInfo(
          c.text?.pageNumber,
          g.text?.pageNumber,
          baseText,
        ),
        watermark: getTextInfo(c.text?.watermark, g.text?.watermark, baseText),
        //
        bullet1: getTextInfo(c.text?.bullet1, g.text?.bullet1, baseText),
        bullet2: getTextInfo(c.text?.bullet2, g.text?.bullet2, baseText),
        bullet3: getTextInfo(c.text?.bullet3, g.text?.bullet3, baseText),
      },
      header: {
        padding: new Padding(
          m(c.header?.padding, g.header?.padding, d.header.padding),
        ).toScaled(sf),
        backgroundColor: m(
          c.header?.backgroundColor,
          g.header?.backgroundColor,
          d.header.backgroundColor,
        ),
        logoHeight: ms(
          sf,
          c.header?.logoHeight,
          g.header?.logoHeight,
          d.header.logoHeight,
        ),
        logoGapX: ms(
          sf,
          c.header?.logoGapX,
          g.header?.logoGapX,
          d.header.logoGapX,
        ),
        logoPlacement: m(
          c.header?.logoPlacement,
          g.header?.logoPlacement,
          d.header.logoPlacement,
        ),
        logoBottomPadding: ms(
          sf,
          c.header?.logoBottomPadding,
          g.header?.logoBottomPadding,
          d.header.logoBottomPadding,
        ),
        headerBottomPadding: ms(
          sf,
          c.header?.headerBottomPadding,
          g.header?.headerBottomPadding,
          d.header.headerBottomPadding,
        ),
        subHeaderBottomPadding: ms(
          sf,
          c.header?.subHeaderBottomPadding,
          g.header?.subHeaderBottomPadding,
          d.header.subHeaderBottomPadding,
        ),
        bottomBorderStrokeWidth: ms(
          sf,
          c.header?.bottomBorderStrokeWidth,
          g.header?.bottomBorderStrokeWidth,
          d.header.bottomBorderStrokeWidth,
        ),
        bottomBorderColor: m(
          c.header?.bottomBorderColor,
          g.header?.bottomBorderColor,
          d.header.bottomBorderColor,
        ),
      },
      footer: {
        padding: new Padding(
          m(c.footer?.padding, g.footer?.padding, d.footer.padding),
        ).toScaled(sf),
        logoHeight: ms(
          sf,
          c.footer?.logoHeight,
          g.footer?.logoHeight,
          d.footer.logoHeight,
        ),
        logoGapX: ms(
          sf,
          c.footer?.logoGapX,
          g.footer?.logoGapX,
          d.footer.logoGapX,
        ),
        backgroundColor: m(
          c.footer?.backgroundColor,
          g.footer?.backgroundColor,
          d.footer.backgroundColor,
        ),
      },
      content: {
        padding: new Padding(
          m(c.content?.padding, g.content?.padding, d.content.padding),
        ).toScaled(sf),
        backgroundColor: m(
          c.content?.backgroundColor,
          g.content?.backgroundColor,
          d.content.backgroundColor,
        ),
        tabWidth: ms(
          sf,
          c.content?.tabWidth,
          g.content?.tabWidth,
          d.content.tabWidth,
        ),
        gapX: ms(sf, c.content?.gapX, g.content?.gapX, d.content.gapX),
        gapY: ms(sf, c.content?.gapY, g.content?.gapY, d.content.gapY),
        bullets: {
          bullet1: {
            marker: m(
              c.content?.bullets?.bullet1?.marker,
              g.content?.bullets?.bullet1?.marker,
              d.content.bullets.bullet1.marker,
            ),
            markerIndent: ms(
              sf,
              c.content?.bullets?.bullet1?.markerIndent,
              g.content?.bullets?.bullet1?.markerIndent,
              d.content.bullets.bullet1.markerIndent,
            ),
            textIndent: ms(
              sf,
              c.content?.bullets?.bullet1?.textIndent,
              g.content?.bullets?.bullet1?.textIndent,
              d.content.bullets.bullet1.textIndent,
            ),
            topGapToPreviousBullet: m(
              c.content?.bullets?.bullet1?.topGapToPreviousBullet,
              g.content?.bullets?.bullet1?.topGapToPreviousBullet,
              d.content.bullets.bullet1.topGapToPreviousBullet,
            ),
          },
          bullet2: {
            marker: m(
              c.content?.bullets?.bullet2?.marker,
              g.content?.bullets?.bullet2?.marker,
              d.content.bullets.bullet2.marker,
            ),
            markerIndent: ms(
              sf,
              c.content?.bullets?.bullet2?.markerIndent,
              g.content?.bullets?.bullet2?.markerIndent,
              d.content.bullets.bullet2.markerIndent,
            ),
            textIndent: ms(
              sf,
              c.content?.bullets?.bullet2?.textIndent,
              g.content?.bullets?.bullet2?.textIndent,
              d.content.bullets.bullet2.textIndent,
            ),
            topGapToPreviousBullet: m(
              c.content?.bullets?.bullet2?.topGapToPreviousBullet,
              g.content?.bullets?.bullet2?.topGapToPreviousBullet,
              d.content.bullets.bullet2.topGapToPreviousBullet,
            ),
          },
          bullet3: {
            marker: m(
              c.content?.bullets?.bullet3?.marker,
              g.content?.bullets?.bullet3?.marker,
              d.content.bullets.bullet3.marker,
            ),
            markerIndent: ms(
              sf,
              c.content?.bullets?.bullet3?.markerIndent,
              g.content?.bullets?.bullet3?.markerIndent,
              d.content.bullets.bullet3.markerIndent,
            ),
            textIndent: ms(
              sf,
              c.content?.bullets?.bullet3?.textIndent,
              g.content?.bullets?.bullet3?.textIndent,
              d.content.bullets.bullet3.textIndent,
            ),
            topGapToPreviousBullet: m(
              c.content?.bullets?.bullet3?.topGapToPreviousBullet,
              g.content?.bullets?.bullet3?.topGapToPreviousBullet,
              d.content.bullets.bullet3.topGapToPreviousBullet,
            ),
          },
        },
        itemLayoutDefaults: {} as {
          [
            K in
              | "spacer"
              | "paragraph"
              | "heading"
              | "bullets"
              | "quote"
              | "rawImage"
              | "htmlImage"
              | "figure"
              | "table"
          ]: { stretch: boolean; fillArea: boolean };
        }, // Will be populated below
      },
      cover: {
        backgroundColor: m(
          c.cover?.backgroundColor,
          g.cover?.backgroundColor,
          d.cover.backgroundColor,
        ),
        logoHeight: ms(
          sf,
          c.cover?.logoHeight,
          g.cover?.logoHeight,
          d.cover.logoHeight,
        ),
        logoGapX: ms(
          sf,
          c.cover?.logoGapX,
          g.cover?.logoGapX,
          d.cover.logoGapX,
        ),
        gapY: ms(sf, c.cover?.gapY, g.cover?.gapY, d.cover.gapY),
      },
      section: {
        backgroundColor: m(
          c.section?.backgroundColor,
          g.section?.backgroundColor,
          d.section.backgroundColor,
        ),
        gapY: ms(sf, c.section?.gapY, g.section?.gapY, d.section.gapY),
      },
    };

    // Merge itemLayoutDefaults
    const itemTypes = [
      "spacer",
      "paragraph",
      "heading",
      "bullets",
      "quote",
      "figure",
      "htmlImage",
    ] as const;
    for (const itemType of itemTypes) {
      mergedStyle.content.itemLayoutDefaults[itemType] = {
        stretch: m(
          c.content?.itemLayoutDefaults?.[itemType]?.stretch,
          g.content?.itemLayoutDefaults?.[itemType]?.stretch,
          d.content.itemLayoutDefaults[itemType].stretch,
        ),
        fillArea: m(
          c.content?.itemLayoutDefaults?.[itemType]?.fillArea,
          g.content?.itemLayoutDefaults?.[itemType]?.fillArea,
          d.content.itemLayoutDefaults[itemType].fillArea,
        ),
      };
    }

    return mergedStyle;
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  //  ________                     __                       __                                                    __              __                          //
  // /        |                   /  |                     /  |                                                  /  |            /  |                         //
  // $$$$$$$$/______   _______   _$$ |_    _______        _$$ |_     ______          ______    ______    ______  $$/   _______  _$$ |_     ______    ______   //
  // $$ |__  /      \ /       \ / $$   |  /       |      / $$   |   /      \        /      \  /      \  /      \ /  | /       |/ $$   |   /      \  /      \  //
  // $$    |/$$$$$$  |$$$$$$$  |$$$$$$/  /$$$$$$$/       $$$$$$/   /$$$$$$  |      /$$$$$$  |/$$$$$$  |/$$$$$$  |$$ |/$$$$$$$/ $$$$$$/   /$$$$$$  |/$$$$$$  | //
  // $$$$$/ $$ |  $$ |$$ |  $$ |  $$ | __$$      \         $$ | __ $$ |  $$ |      $$ |  $$/ $$    $$ |$$ |  $$ |$$ |$$      \   $$ | __ $$    $$ |$$ |  $$/  //
  // $$ |   $$ \__$$ |$$ |  $$ |  $$ |/  |$$$$$$  |        $$ |/  |$$ \__$$ |      $$ |      $$$$$$$$/ $$ \__$$ |$$ | $$$$$$  |  $$ |/  |$$$$$$$$/ $$ |       //
  // $$ |   $$    $$/ $$ |  $$ |  $$  $$//     $$/         $$  $$/ $$    $$/       $$ |      $$       |$$    $$ |$$ |/     $$/   $$  $$/ $$       |$$ |       //
  // $$/     $$$$$$/  $$/   $$/    $$$$/ $$$$$$$/           $$$$/   $$$$$$/        $$/        $$$$$$$/  $$$$$$$ |$$/ $$$$$$$/     $$$$/   $$$$$$$/ $$/        //
  //                                                                                                   /  \__$$ |                                             //
  //                                                                                                   $$    $$/                                              //
  //                                                                                                    $$$$$$/                                               //
  //                                                                                                                                                          //
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getMergedPageFontsToRegister(): FontInfo[] {
    const d = this._d;
    const gText = this._g.text ?? {};
    const cText = this._c?.text ?? {};

    const baseFont = cText?.base?.font ?? gText?.base?.font ?? d.baseText.font;

    // Dynamically build the font list from PAGE_TEXT_STYLE_KEYS
    const allFonts = PAGE_TEXT_STYLE_KEYS.map((key) => {
      if (key === "base") {
        return getFont(baseFont);
      }
      return getMergedFont(cText?.[key], gText?.[key], baseFont);
    });

    return deduplicateFonts(allFonts);
  }
}
