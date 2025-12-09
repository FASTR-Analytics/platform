// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { assert, type ColorKeyOrString } from "./deps.ts";
import type { MarkdownTextStyleOptions } from "./text_style_keys.ts";

export type MarginOptionsEm = {
  top?: number; // em multiplier (relative to element's font size)
  bottom?: number; // em multiplier
};

export type ListMarginOptionsEm = MarginOptionsEm & {
  gap?: number; // em multiplier for spacing between list items
};

export type ListLevelOptionsEm = {
  marker?: string;
  markerIndentEm?: number; // em multiplier (relative to list text font size)
  textIndentEm?: number; // em multiplier (relative to list text font size)
};

export type CustomMarkdownStyleOptions = {
  scale?: number;

  text?: MarkdownTextStyleOptions;

  marginsEm?: {
    paragraph?: MarginOptionsEm;
    h1?: MarginOptionsEm;
    h2?: MarginOptionsEm;
    h3?: MarginOptionsEm;
    h4?: MarginOptionsEm;
    h5?: MarginOptionsEm;
    h6?: MarginOptionsEm;
    list?: ListMarginOptionsEm;
    image?: MarginOptionsEm;
    table?: MarginOptionsEm;
    blockquote?: MarginOptionsEm;
    horizontalRule?: MarginOptionsEm;
    code?: MarginOptionsEm;
  };

  bulletList?: {
    level0?: ListLevelOptionsEm;
    level1?: ListLevelOptionsEm;
    level2?: ListLevelOptionsEm;
  };

  numberedList?: {
    level0?: ListLevelOptionsEm;
    level1?: ListLevelOptionsEm;
    level2?: ListLevelOptionsEm;
  };

  blockquote?: {
    leftBorderWidth?: number; // Absolute pixels
    leftBorderColor?: ColorKeyOrString;
    paddingEm?: {
      top?: number; // em multiplier
      bottom?: number; // em multiplier
      left?: number; // em multiplier (space between border and text)
      right?: number; // em multiplier
    };
    paragraphGapEm?: number; // em multiplier for gap between paragraphs within blockquote
    align?: "left" | "center" | "right";
    backgroundColor?: ColorKeyOrString | "none";
  };

  code?: {
    backgroundColor?: ColorKeyOrString;
    paddingEm?: {
      horizontal?: number;
      vertical?: number;
    };
  };

  horizontalRule?: {
    strokeWidth?: number; // Absolute pixels
    strokeColor?: ColorKeyOrString;
  };

  link?: {
    color?: ColorKeyOrString;
    underline?: boolean;
  };

  image?: {
    defaultAspectRatio?: number;
  };

  table?: {
    border?: {
      width?: number; // Absolute pixels
      color?: ColorKeyOrString;
      style?: "single" | "double" | "dotted";
    };
    cellPaddingEm?: {
      horizontal?: number; // em multiplier
      vertical?: number; // em multiplier
    };
    headerShading?: {
      color?: ColorKeyOrString;
      opacity?: number; // 0-1
    };
  };

  math?: {
    displayAlign?: "left" | "center" | "right";
  };
};

let _GS: CustomMarkdownStyleOptions | undefined = undefined;

export function setGlobalMarkdownStyle(gs: CustomMarkdownStyleOptions): void {
  assert(_GS === undefined, "Global markdown styles have already been set");
  _GS = gs;
}

export function getGlobalMarkdownStyle(): CustomMarkdownStyleOptions {
  return _GS ?? {};
}
