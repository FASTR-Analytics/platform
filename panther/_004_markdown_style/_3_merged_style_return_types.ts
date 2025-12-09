// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ColorKeyOrString, TextInfoUnkeyed } from "./deps.ts";

export type MergedMargin = {
  top: number;
  bottom: number;
};

export type MergedListMargin = MergedMargin & {
  gap: number;
};

export type MergedListLevel = {
  marker: string;
  markerIndent: number;
  textIndent: number;
};

export type MergedMarkdownStyle = {
  alreadyScaledValue: number;

  text: {
    paragraph: TextInfoUnkeyed;
    h1: TextInfoUnkeyed;
    h2: TextInfoUnkeyed;
    h3: TextInfoUnkeyed;
    h4: TextInfoUnkeyed;
    h5: TextInfoUnkeyed;
    h6: TextInfoUnkeyed;
    list: TextInfoUnkeyed;
    blockquote: TextInfoUnkeyed;
    code: TextInfoUnkeyed;
  };

  margins: {
    paragraph: MergedMargin;
    h1: MergedMargin;
    h2: MergedMargin;
    h3: MergedMargin;
    h4: MergedMargin;
    h5: MergedMargin;
    h6: MergedMargin;
    list: MergedListMargin;
    image: MergedMargin;
    table: MergedMargin;
    blockquote: MergedMargin;
    horizontalRule: MergedMargin;
    code: MergedMargin;
  };

  bulletList: {
    level0: MergedListLevel;
    level1: MergedListLevel;
    level2: MergedListLevel;
  };

  numberedList: {
    level0: MergedListLevel;
    level1: MergedListLevel;
    level2: MergedListLevel;
  };

  blockquote: {
    leftBorderWidth: number;
    leftBorderColor: string;
    paddingTop: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paragraphGap: number;
    align: "left" | "center" | "right";
    backgroundColor: string | "none";
  };

  code: {
    backgroundColor: string;
    paddingHorizontal: number;
    paddingVertical: number;
  };

  horizontalRule: {
    strokeWidth: number;
    strokeColor: string;
  };

  link: {
    color: string;
    underline: boolean;
  };

  image: {
    defaultAspectRatio: number;
  };

  table: {
    borderWidth: number;
    borderColor: string;
    borderStyle: "single" | "double" | "dotted";
    cellPaddingHorizontal: number;
    cellPaddingVertical: number;
    headerShadingColor: string;
    headerShadingOpacity: number;
  };

  math: {
    displayAlign: "left" | "center" | "right";
  };
};
