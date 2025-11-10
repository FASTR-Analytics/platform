// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ADTBullets } from "./bullets.ts";
import type { ADTFigure } from "./figure.ts";
import type { ADTHeading } from "./heading.ts";
import type { ADTHtmlImage } from "./html_image.ts";
import type { ADTParagraph } from "./paragraph.ts";
import type { ADTQuote } from "./quote.ts";
import type { ADTSpacer } from "./spacer.ts";

export type ADTItem =
  | ADTSpacer
  | ADTParagraph
  | ADTHeading
  | ADTBullets
  | ADTQuote
  | ADTHtmlImage
  | ADTFigure;

export type ADTItemType =
  | "spacer"
  | "paragraph"
  | "heading"
  | "bullets"
  | "quote"
  | "htmlImage"
  | "figure";
