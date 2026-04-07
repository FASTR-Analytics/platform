// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { PageNumberBackground } from "./_2_custom_page_style_options.ts";
import type { AlignH, AlignV, Padding, TextInfoUnkeyed } from "./deps.ts";

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
    pageNumber: TextInfoUnkeyed;
    watermark: TextInfoUnkeyed;
  };
  cover: {
    padding: Padding;
    backgroundColor: string;
    logoHeight: number;
    logoGapX: number;
    logoBottomPadding: number;
    titleBottomPadding: number;
    subTitleBottomPadding: number;
    authorBottomPadding: number;
    alignH: AlignH;
    alignV: AlignV;
  };
  section: {
    padding: Padding;
    backgroundColor: string;
    sectionTitleBottomPadding: number;
    alignH: AlignH;
    alignV: AlignV;
  };
  header: {
    padding: Padding;
    logoHeight: number;
    logoGapX: number;
    logoPlacement: "left" | "right";
    backgroundColor: string;
    logoBottomPadding: number;
    headerBottomPadding: number;
    subHeaderBottomPadding: number;
    bottomBorderStrokeWidth: number;
    bottomBorderColor: string;
    alignH: AlignH;
  };
  footer: {
    padding: Padding;
    logoHeight: number;
    logoGapX: number;
    backgroundColor: string;
    alignH: AlignH;
  };
  content: {
    padding: Padding;
    backgroundColor: string;
    gapX: number;
    gapY: number;
  };
  layoutContainers: {
    padding: Padding;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    rectRadius: number;
  };
  pageNumber: {
    placement: "bottom-right" | "bottom-left" | "bottom-center";
    padding: Padding;
    background: PageNumberBackground;
    backgroundColor: string;
  };
};
