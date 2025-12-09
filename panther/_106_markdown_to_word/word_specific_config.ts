// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { AlignmentType, PageOrientation } from "./deps.ts";

export type WordFont =
  | "aptos"
  | "calibri"
  | "cambria"
  | "arial"
  | "times-new-roman";

export type WordSpecificConfig = {
  font?: WordFont;
  lineHeightOverride?: number;

  page?: {
    margins?: {
      top?: number; // inches
      bottom?: number;
      left?: number;
      right?: number;
    };
    orientation?: (typeof PageOrientation)[keyof typeof PageOrientation];
  };

  footer?: {
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    fontSize?: number; // half-points
    showPageNumbers?: boolean;
    format?: "current_of_total" | "current_only";
  };

  table?: {
    spaceBefore?: number; // twips
    spaceAfter?: number; // twips
  };

  image?: {
    maxWidthInches?: number;
  };
};

export const DEFAULT_WORD_SPECIFIC_CONFIG: WordSpecificConfig = {
  font: "cambria",
  lineHeightOverride: 1.2,
  page: {
    margins: { top: 0.8, bottom: 0.8, left: 0.8, right: 0.8 },
    orientation: PageOrientation.PORTRAIT,
  },
  footer: {
    alignment: AlignmentType.RIGHT,
    fontSize: 20, // 10pt
    showPageNumbers: true,
    format: "current_of_total",
  },
  table: {
    spaceBefore: 120,
    spaceAfter: 120,
  },
  image: {
    maxWidthInches: 6.9,
  },
};
