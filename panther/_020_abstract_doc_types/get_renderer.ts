// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { ADTItem, ADTItemType } from "./adt_item.ts";
import type { ADTItemRenderer } from "./adt_item_renderer.ts";
import { BulletsRenderer } from "./bullets.ts";
import { FigureRenderer } from "./figure.ts";
import { HeadingRenderer } from "./heading.ts";
import { HtmlImageRenderer } from "./html_image.ts";
import { ParagraphRenderer } from "./paragraph.ts";
import { QuoteRenderer } from "./quote.ts";
import { SpacerRenderer } from "./spacer.ts";

// deno-lint-ignore no-explicit-any
type AnyADTItemRenderer = ADTItemRenderer<any, any>;

export function getADTItemRendererForADTItem(
  item: ADTItem,
): AnyADTItemRenderer | undefined {
  if (SpacerRenderer.isType(item)) return SpacerRenderer;
  if (ParagraphRenderer.isType(item)) return ParagraphRenderer;
  if (HeadingRenderer.isType(item)) return HeadingRenderer;
  if (BulletsRenderer.isType(item)) return BulletsRenderer;
  if (QuoteRenderer.isType(item)) return QuoteRenderer;
  if (HtmlImageRenderer.isType(item)) return HtmlImageRenderer;
  // Note: FigureRenderer is not an ADTItemRenderer, handle it separately
  return undefined;
}

export function getADTItemType(item: ADTItem): ADTItemType {
  if (SpacerRenderer.isType(item)) return "spacer";
  if (ParagraphRenderer.isType(item)) return "paragraph";
  if (HeadingRenderer.isType(item)) return "heading";
  if (BulletsRenderer.isType(item)) return "bullets";
  if (QuoteRenderer.isType(item)) return "quote";
  if (HtmlImageRenderer.isType(item)) return "htmlImage";
  if (FigureRenderer.isType(item)) return "figure";

  // This should never happen if ADTItem is properly typed
  throw new Error("Unknown ADT item type");
}
