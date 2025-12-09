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
import {
  type FontInfo,
  getBaseText,
  getBaseTextInfo,
  getColor,
  getFontsToRegister,
  getTextInfo,
  m,
  ms,
  Padding,
  type TextInfo,
} from "./deps.ts";
import { PAGE_TEXT_STYLE_KEYS } from "./text_style_keys.ts";

export class CustomPageStyle {
  private _d: DefaultPageStyle;
  private _g: CustomPageStyleOptions;
  private _c: CustomPageStyleOptions;
  private _sf: number;
  private _baseText: TextInfo;

  constructor(
    customStyle: CustomPageStyleOptions | undefined,
    responsiveScale?: number,
  ) {
    this._d = getDefaultPageStyle();
    this._g = getGlobalPageStyle();
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

  getMergedPageStyle(): MergedPageStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;

    return {
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
        pageNumber: getTextInfo(
          c.text?.pageNumber,
          g.text?.pageNumber,
          baseText,
        ),
        watermark: getTextInfo(c.text?.watermark, g.text?.watermark, baseText),
      },
      header: {
        padding: new Padding(
          m(c.header?.padding, g.header?.padding, d.header.padding),
        ).toScaled(sf),
        backgroundColor: getColor(
          m(
            c.header?.backgroundColor,
            g.header?.backgroundColor,
            d.header.backgroundColor,
          ),
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
        bottomBorderColor: getColor(
          m(
            c.header?.bottomBorderColor,
            g.header?.bottomBorderColor,
            d.header.bottomBorderColor,
          ),
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
        backgroundColor: getColor(
          m(
            c.footer?.backgroundColor,
            g.footer?.backgroundColor,
            d.footer.backgroundColor,
          ),
        ),
      },
      content: {
        padding: new Padding(
          m(c.content?.padding, g.content?.padding, d.content.padding),
        ).toScaled(sf),
        backgroundColor: getColor(
          m(
            c.content?.backgroundColor,
            g.content?.backgroundColor,
            d.content.backgroundColor,
          ),
        ),
        gapX: ms(sf, c.content?.gapX, g.content?.gapX, d.content.gapX),
        gapY: ms(sf, c.content?.gapY, g.content?.gapY, d.content.gapY),
        nColumns: c.content?.nColumns ?? g.content?.nColumns ??
          d.content.nColumns,
      },
      cover: {
        backgroundColor: getColor(
          m(
            c.cover?.backgroundColor,
            g.cover?.backgroundColor,
            d.cover.backgroundColor,
          ),
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
        backgroundColor: getColor(
          m(
            c.section?.backgroundColor,
            g.section?.backgroundColor,
            d.section.backgroundColor,
          ),
        ),
        gapY: ms(sf, c.section?.gapY, g.section?.gapY, d.section.gapY),
      },
      layoutContainers: {
        padding: new Padding(
          m(
            c.layoutContainers?.padding,
            g.layoutContainers?.padding,
            d.layoutContainers.padding,
          ),
        ).toScaled(sf),
        backgroundColor: getColor(
          m(
            c.layoutContainers?.backgroundColor,
            g.layoutContainers?.backgroundColor,
            d.layoutContainers.backgroundColor,
          ),
        ),
        borderColor: getColor(
          m(
            c.layoutContainers?.borderColor,
            g.layoutContainers?.borderColor,
            d.layoutContainers.borderColor,
          ),
        ),
        borderWidth: ms(
          sf,
          c.layoutContainers?.borderWidth,
          g.layoutContainers?.borderWidth,
          d.layoutContainers.borderWidth,
        ),
        borderRadius: ms(
          sf,
          c.layoutContainers?.borderRadius,
          g.layoutContainers?.borderRadius,
          d.layoutContainers.borderRadius,
        ),
      },
    };
  }

  getFontsToRegister(): FontInfo[] {
    return getFontsToRegister(
      PAGE_TEXT_STYLE_KEYS,
      this._c.text,
      this._g.text,
      getBaseText().font,
    );
  }
}
