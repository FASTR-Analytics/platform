// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  CustomFigureStyle,
  CustomMarkdownStyle,
  CustomPageStyle,
  deduplicateFonts,
  type FontInfo,
  getAdjustedBaseTextOptions,
} from "./deps.ts";
import type { CustomStyleOptions } from "./custom_style_options.ts";

export class CustomStyle {
  private _figure: CustomFigureStyle;
  private _markdown: CustomMarkdownStyle;
  private _page: CustomPageStyle;

  constructor(options?: CustomStyleOptions, responsiveScale?: number) {
    const { scale, baseText, figure, markdown, page } = options ?? {};

    // Merge shared baseText with domain-specific text options
    this._figure = new CustomFigureStyle(
      {
        scale,
        ...figure,
        text: {
          ...figure?.text,
          base: getAdjustedBaseTextOptions(baseText, figure?.text?.base),
        },
      },
      responsiveScale,
    );

    this._markdown = new CustomMarkdownStyle(
      {
        scale,
        ...markdown,
        text: {
          ...markdown?.text,
          base: getAdjustedBaseTextOptions(baseText, markdown?.text?.base),
        },
      },
      responsiveScale,
    );

    this._page = new CustomPageStyle(
      {
        scale,
        ...page,
        text: {
          ...page?.text,
          base: getAdjustedBaseTextOptions(baseText, page?.text?.base),
        },
      },
      responsiveScale,
    );
  }

  figure(): CustomFigureStyle {
    return this._figure;
  }

  markdown(): CustomMarkdownStyle {
    return this._markdown;
  }

  page(): CustomPageStyle {
    return this._page;
  }

  getFontsToRegister(): FontInfo[] {
    return deduplicateFonts([
      ...this._figure.getFontsToRegister(),
      ...this._markdown.getFontsToRegister(),
      ...this._page.getFontsToRegister(),
    ]);
  }
}
