// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, Padding, TextInfoUnkeyed } from "./deps.ts";

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
    backgroundColor: string;
    logoHeight: number;
    logoGapX: number;
    gapY: number;
  };
  section: {
    backgroundColor: string;
    gapY: number;
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
  };
  footer: {
    padding: Padding;
    logoHeight: number;
    logoGapX: number;
    backgroundColor: string;
  };
  content: {
    padding: Padding;
    backgroundColor: string;
    gapX: number;
    gapY: number;
    nColumns: number;
  };
  layoutContainers: {
    padding: Padding;
    backgroundColor: string;
    borderColor: string;
    borderWidth: number;
    borderRadius: number;
  };
};
