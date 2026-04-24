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
import type {
  MergedCoverStyle,
  MergedFreeformStyle,
  MergedPageNumberStyle,
  MergedSectionStyle,
} from "./_3_merged_style_return_types.ts";
import {
  type FontInfo,
  getBaseText,
  getBaseTextInfo,
  getColor,
  getFontsToRegister,
  getTextInfo,
  m,
  ms,
  msPadding,
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

  getMergedCoverStyle(): MergedCoverStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;

    return {
      alreadyScaledValue: sf,
      padding: msPadding(sf, c.cover?.padding, g.cover?.padding, d.cover.padding),
      backgroundColor: getColor(
        m(c.cover?.backgroundColor, g.cover?.backgroundColor, d.cover.backgroundColor),
      ),
      logoHeight: ms(sf, c.cover?.logoHeight, g.cover?.logoHeight, d.cover.logoHeight),
      logoGapX: ms(sf, c.cover?.logoGapX, g.cover?.logoGapX, d.cover.logoGapX),
      logoBottomPadding: ms(
        sf,
        c.cover?.logoBottomPadding,
        g.cover?.logoBottomPadding,
        d.cover.logoBottomPadding,
      ),
      titleBottomPadding: ms(
        sf,
        c.cover?.titleBottomPadding,
        g.cover?.titleBottomPadding,
        d.cover.titleBottomPadding,
      ),
      subTitleBottomPadding: ms(
        sf,
        c.cover?.subTitleBottomPadding,
        g.cover?.subTitleBottomPadding,
        d.cover.subTitleBottomPadding,
      ),
      authorBottomPadding: ms(
        sf,
        c.cover?.authorBottomPadding,
        g.cover?.authorBottomPadding,
        d.cover.authorBottomPadding,
      ),
      alignH: m(c.cover?.alignH, g.cover?.alignH, d.cover.alignH),
      alignV: m(c.cover?.alignV, g.cover?.alignV, d.cover.alignV),
      text: {
        coverTitle: getTextInfo(c.text?.coverTitle, g.text?.coverTitle, baseText),
        coverSubTitle: getTextInfo(c.text?.coverSubTitle, g.text?.coverSubTitle, baseText),
        coverAuthor: getTextInfo(c.text?.coverAuthor, g.text?.coverAuthor, baseText),
        coverDate: getTextInfo(c.text?.coverDate, g.text?.coverDate, baseText),
        pageNumber: getTextInfo(c.text?.pageNumber, g.text?.pageNumber, baseText),
        watermark: getTextInfo(c.text?.watermark, g.text?.watermark, baseText),
      },
      pageNumber: this._getPageNumberStyle(),
    };
  }

  getMergedSectionStyle(): MergedSectionStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;

    return {
      alreadyScaledValue: sf,
      padding: msPadding(sf, c.section?.padding, g.section?.padding, d.section.padding),
      backgroundColor: getColor(
        m(c.section?.backgroundColor, g.section?.backgroundColor, d.section.backgroundColor),
      ),
      sectionTitleBottomPadding: ms(
        sf,
        c.section?.sectionTitleBottomPadding,
        g.section?.sectionTitleBottomPadding,
        d.section.sectionTitleBottomPadding,
      ),
      alignH: m(c.section?.alignH, g.section?.alignH, d.section.alignH),
      alignV: m(c.section?.alignV, g.section?.alignV, d.section.alignV),
      text: {
        sectionTitle: getTextInfo(c.text?.sectionTitle, g.text?.sectionTitle, baseText),
        sectionSubTitle: getTextInfo(c.text?.sectionSubTitle, g.text?.sectionSubTitle, baseText),
        pageNumber: getTextInfo(c.text?.pageNumber, g.text?.pageNumber, baseText),
        watermark: getTextInfo(c.text?.watermark, g.text?.watermark, baseText),
      },
      pageNumber: this._getPageNumberStyle(),
    };
  }

  getMergedFreeformStyle(): MergedFreeformStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;
    const baseText = this._baseText;

    return {
      alreadyScaledValue: sf,
      header: {
        padding: msPadding(
          sf,
          c.freeform?.header?.padding,
          g.freeform?.header?.padding,
          d.freeform.header.padding,
        ),
        backgroundColor: getColor(
          m(
            c.freeform?.header?.backgroundColor,
            g.freeform?.header?.backgroundColor,
            d.freeform.header.backgroundColor,
          ),
        ),
        logoHeight: ms(
          sf,
          c.freeform?.header?.logoHeight,
          g.freeform?.header?.logoHeight,
          d.freeform.header.logoHeight,
        ),
        logoGapX: ms(
          sf,
          c.freeform?.header?.logoGapX,
          g.freeform?.header?.logoGapX,
          d.freeform.header.logoGapX,
        ),
        logoPlacement: m(
          c.freeform?.header?.logoPlacement,
          g.freeform?.header?.logoPlacement,
          d.freeform.header.logoPlacement,
        ),
        logoBottomPadding: ms(
          sf,
          c.freeform?.header?.logoBottomPadding,
          g.freeform?.header?.logoBottomPadding,
          d.freeform.header.logoBottomPadding,
        ),
        headerBottomPadding: ms(
          sf,
          c.freeform?.header?.headerBottomPadding,
          g.freeform?.header?.headerBottomPadding,
          d.freeform.header.headerBottomPadding,
        ),
        subHeaderBottomPadding: ms(
          sf,
          c.freeform?.header?.subHeaderBottomPadding,
          g.freeform?.header?.subHeaderBottomPadding,
          d.freeform.header.subHeaderBottomPadding,
        ),
        bottomBorderStrokeWidth: ms(
          sf,
          c.freeform?.header?.bottomBorderStrokeWidth,
          g.freeform?.header?.bottomBorderStrokeWidth,
          d.freeform.header.bottomBorderStrokeWidth,
        ),
        bottomBorderColor: getColor(
          m(
            c.freeform?.header?.bottomBorderColor,
            g.freeform?.header?.bottomBorderColor,
            d.freeform.header.bottomBorderColor,
          ),
        ),
        alignH: m(
          c.freeform?.header?.alignH,
          g.freeform?.header?.alignH,
          d.freeform.header.alignH,
        ),
      },
      footer: {
        padding: msPadding(
          sf,
          c.freeform?.footer?.padding,
          g.freeform?.footer?.padding,
          d.freeform.footer.padding,
        ),
        logoHeight: ms(
          sf,
          c.freeform?.footer?.logoHeight,
          g.freeform?.footer?.logoHeight,
          d.freeform.footer.logoHeight,
        ),
        logoGapX: ms(
          sf,
          c.freeform?.footer?.logoGapX,
          g.freeform?.footer?.logoGapX,
          d.freeform.footer.logoGapX,
        ),
        backgroundColor: getColor(
          m(
            c.freeform?.footer?.backgroundColor,
            g.freeform?.footer?.backgroundColor,
            d.freeform.footer.backgroundColor,
          ),
        ),
        alignH: m(
          c.freeform?.footer?.alignH,
          g.freeform?.footer?.alignH,
          d.freeform.footer.alignH,
        ),
      },
      content: {
        padding: msPadding(
          sf,
          c.freeform?.content?.padding,
          g.freeform?.content?.padding,
          d.freeform.content.padding,
        ),
        backgroundColor: getColor(
          m(
            c.freeform?.content?.backgroundColor,
            g.freeform?.content?.backgroundColor,
            d.freeform.content.backgroundColor,
          ),
        ),
        gapX: ms(
          sf,
          c.freeform?.content?.gapX,
          g.freeform?.content?.gapX,
          d.freeform.content.gapX,
        ),
        gapY: ms(
          sf,
          c.freeform?.content?.gapY,
          g.freeform?.content?.gapY,
          d.freeform.content.gapY,
        ),
      },
      layoutContainers: {
        padding: msPadding(
          sf,
          c.freeform?.layoutContainers?.padding,
          g.freeform?.layoutContainers?.padding,
          d.freeform.layoutContainers.padding,
        ),
        backgroundColor: getColor(
          m(
            c.freeform?.layoutContainers?.backgroundColor,
            g.freeform?.layoutContainers?.backgroundColor,
            d.freeform.layoutContainers.backgroundColor,
          ),
        ),
        borderColor: getColor(
          m(
            c.freeform?.layoutContainers?.borderColor,
            g.freeform?.layoutContainers?.borderColor,
            d.freeform.layoutContainers.borderColor,
          ),
        ),
        borderWidth: ms(
          sf,
          c.freeform?.layoutContainers?.borderWidth,
          g.freeform?.layoutContainers?.borderWidth,
          d.freeform.layoutContainers.borderWidth,
        ),
        rectRadius: ms(
          sf,
          c.freeform?.layoutContainers?.rectRadius,
          g.freeform?.layoutContainers?.rectRadius,
          d.freeform.layoutContainers.rectRadius,
        ),
      },
      text: {
        header: getTextInfo(c.text?.header, g.text?.header, baseText),
        subHeader: getTextInfo(c.text?.subHeader, g.text?.subHeader, baseText),
        date: getTextInfo(c.text?.date, g.text?.date, baseText),
        footer: getTextInfo(c.text?.footer, g.text?.footer, baseText),
        pageNumber: getTextInfo(c.text?.pageNumber, g.text?.pageNumber, baseText),
        watermark: getTextInfo(c.text?.watermark, g.text?.watermark, baseText),
      },
      pageNumber: this._getPageNumberStyle(),
    };
  }

  private _getPageNumberStyle(): MergedPageNumberStyle {
    const c = this._c;
    const g = this._g;
    const d = this._d;
    const sf = this._sf;

    return {
      placement: m(c.pageNumber?.placement, g.pageNumber?.placement, d.pageNumber.placement),
      padding: msPadding(sf, c.pageNumber?.padding, g.pageNumber?.padding, d.pageNumber.padding),
      background: m(c.pageNumber?.background, g.pageNumber?.background, d.pageNumber.background),
      backgroundColor: getColor(
        m(c.pageNumber?.backgroundColor, g.pageNumber?.backgroundColor, d.pageNumber.backgroundColor),
      ),
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
