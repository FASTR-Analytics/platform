// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type {
  ColorKeyOrString,
  PaddingOptions,
  TextInfoUnkeyed,
} from "./deps.ts";
import type { BulletLevelStyle } from "./bullet_types.ts";

export type MergedPageStyle = {
  alreadyScaledValue: number;
  text: {
    coverTitle: TextInfoUnkeyed;
    coverSubTitle: TextInfoUnkeyed;
    coverAuthor: TextInfoUnkeyed;
    coverDate: TextInfoUnkeyed;
    //
    sectionTitle: TextInfoUnkeyed;
    sectionSubTitle: TextInfoUnkeyed;
    //
    header: TextInfoUnkeyed;
    subHeader: TextInfoUnkeyed;
    date: TextInfoUnkeyed;
    footer: TextInfoUnkeyed;
    paragraph: TextInfoUnkeyed;
    pageNumber: TextInfoUnkeyed;
    watermark: TextInfoUnkeyed;
    //
    bullet1: TextInfoUnkeyed;
    bullet2: TextInfoUnkeyed;
    bullet3: TextInfoUnkeyed;
  };
  cover: {
    backgroundColor: ColorKeyOrString;
    logoHeight: number;
    logoGapX: number;
    gapY: number;
  };
  section: {
    backgroundColor: ColorKeyOrString;
    gapY: number;
  };
  header: {
    padding: PaddingOptions;
    logoHeight: number;
    logoGapX: number;
    logoPlacement: "left" | "right";
    backgroundColor: ColorKeyOrString;
    logoBottomPadding: number;
    headerBottomPadding: number;
    subHeaderBottomPadding: number;
    bottomBorderStrokeWidth: number;
    bottomBorderColor: ColorKeyOrString;
  };
  footer: {
    padding: PaddingOptions;
    logoHeight: number;
    logoGapX: number;
    backgroundColor: ColorKeyOrString;
  };
  content: {
    padding: PaddingOptions;
    backgroundColor: ColorKeyOrString;
    tabWidth: number;
    gapX: number;
    gapY: number;
    bullets: {
      bullet1: BulletLevelStyle;
      bullet2: BulletLevelStyle;
      bullet3: BulletLevelStyle;
    };
    itemLayoutDefaults: {
      [
        K in
          | "spacer"
          | "paragraph"
          | "heading"
          | "bullets"
          | "quote"
          | "figure"
          | "htmlImage"
      ]: {
        stretch: boolean;
        fillArea: boolean;
      };
    };
  };
};
