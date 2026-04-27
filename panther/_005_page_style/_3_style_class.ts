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
  MergedSplitConfig,
} from "./_3_merged_style_return_types.ts";
import {
  type FontInfo,
  getBaseText,
  getBaseTextInfo,
  getColor,
  getFontsToRegister,
  getTextInfo,
  isPatternConfig,
  m,
  ms,
  msArea,
  msPadding,
  type TextInfo,
} from "./deps.ts";
import { PAGE_TEXT_STYLE_KEYS } from "./text_style_keys.ts";
import type {
  LogosPlacement,
  LogosPlacementOptions,
  LogosSizing,
  LogosSizingOptions,
  PageBackgroundStyle,
  SplitConfig,
} from "./types.ts";

function tempBackgroundResolver(bg: PageBackgroundStyle): string {
  if (isPatternConfig(bg)) {
    return getColor(bg.baseColor);
  }
  return getColor(bg);
}

function getMergedSplitBackground(
  c: PageBackgroundStyle | "none" | undefined,
  g: PageBackgroundStyle | "none" | undefined,
  d: PageBackgroundStyle | "none",
): string {
  const bg = m(c, g, d);
  if (bg === "none") return "none";
  return tempBackgroundResolver(bg);
}

function getMergedSplit(
  c: SplitConfig | undefined,
  g: SplitConfig | undefined,
  d: SplitConfig,
): MergedSplitConfig {
  return {
    placement: m(c?.placement, g?.placement, d.placement!),
    sizeAsPct: m(c?.sizeAsPct, g?.sizeAsPct, d.sizeAsPct!),
    background: getMergedSplitBackground(
      c?.background,
      g?.background,
      d.background!,
    ),
  };
}

function getMergedLogosSizing(
  sf: number,
  c: LogosSizingOptions | undefined,
  g: LogosSizingOptions | undefined,
  d: LogosSizing,
): LogosSizing {
  return {
    targetArea: msArea(sf, c?.targetArea, g?.targetArea, d.targetArea),
    maxHeight: ms(sf, c?.maxHeight, g?.maxHeight, d.maxHeight),
    maxWidth: ms(sf, c?.maxWidth, g?.maxWidth, d.maxWidth),
    gapX: ms(sf, c?.gapX, g?.gapX, d.gapX),
  };
}

function getMergedLogosPlacement(
  sf: number,
  c: LogosPlacementOptions | undefined,
  g: LogosPlacementOptions | undefined,
  d: LogosPlacement,
): LogosPlacement {
  return {
    position: m(c?.position, g?.position, d.position),
    gap: ms(sf, c?.gap, g?.gap, d.gap),
  };
}

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
    this._sf =
      (this._c?.scale ?? this._g?.scale ?? this._d.scale) *
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
      padding: msPadding(
        sf,
        c.cover?.padding,
        g.cover?.padding,
        d.cover.padding,
      ),
      background: tempBackgroundResolver(
        m(c.cover?.background, g.cover?.background, d.cover.background),
      ),
      split: getMergedSplit(c.cover?.split, g.cover?.split, d.cover.split),
      logosSizing: getMergedLogosSizing(
        sf,
        c.cover?.logosSizing,
        g.cover?.logosSizing,
        d.cover.logosSizing,
      ),
      logosPlacement: getMergedLogosPlacement(
        sf,
        c.cover?.logosPlacement,
        g.cover?.logosPlacement,
        d.cover.logosPlacement,
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
        pageNumber: getTextInfo(
          c.text?.pageNumber,
          g.text?.pageNumber,
          baseText,
        ),
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
      padding: msPadding(
        sf,
        c.section?.padding,
        g.section?.padding,
        d.section.padding,
      ),
      background: tempBackgroundResolver(
        m(c.section?.background, g.section?.background, d.section.background),
      ),
      split: getMergedSplit(
        c.section?.split,
        g.section?.split,
        d.section.split,
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
        pageNumber: getTextInfo(
          c.text?.pageNumber,
          g.text?.pageNumber,
          baseText,
        ),
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
      split: getMergedSplit(
        c.freeform?.split,
        g.freeform?.split,
        d.freeform.split,
      ),
      header: {
        padding: msPadding(
          sf,
          c.freeform?.header?.padding,
          g.freeform?.header?.padding,
          d.freeform.header.padding,
        ),
        background: tempBackgroundResolver(
          m(
            c.freeform?.header?.background,
            g.freeform?.header?.background,
            d.freeform.header.background,
          ),
        ),
        logosSizing: getMergedLogosSizing(
          sf,
          c.freeform?.header?.logosSizing,
          g.freeform?.header?.logosSizing,
          d.freeform.header.logosSizing,
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
        logosSizing: getMergedLogosSizing(
          sf,
          c.freeform?.footer?.logosSizing,
          g.freeform?.footer?.logosSizing,
          d.freeform.footer.logosSizing,
        ),
        background: tempBackgroundResolver(
          m(
            c.freeform?.footer?.background,
            g.freeform?.footer?.background,
            d.freeform.footer.background,
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
        background: tempBackgroundResolver(
          m(
            c.freeform?.content?.background,
            g.freeform?.content?.background,
            d.freeform.content.background,
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
        pageNumber: getTextInfo(
          c.text?.pageNumber,
          g.text?.pageNumber,
          baseText,
        ),
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
      placement: m(
        c.pageNumber?.placement,
        g.pageNumber?.placement,
        d.pageNumber.placement,
      ),
      padding: msPadding(
        sf,
        c.pageNumber?.padding,
        g.pageNumber?.padding,
        d.pageNumber.padding,
      ),
      background: m(
        c.pageNumber?.background,
        g.pageNumber?.background,
        d.pageNumber.background,
      ),
      backgroundColor: getColor(
        m(
          c.pageNumber?.backgroundColor,
          g.pageNumber?.backgroundColor,
          d.pageNumber.backgroundColor,
        ),
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
