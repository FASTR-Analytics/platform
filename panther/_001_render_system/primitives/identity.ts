// Copyright 2023-2026, Tim Roberton. MIT license.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { HeaderItem } from "../deps.ts";

export type PrimitivePart =
  | "body"
  | "label"
  | "value"
  | "marker"
  | "link"
  | "header";

export type PrimitiveItem = Readonly<Record<string, string>>;

// `@` marks an item key for a thing that is not data, as JSON-LD marks its
// reserved keys, so no reader takes it for a dimension.
export const CAPTION_ITEM_KEY = "@caption";

export type ItemCoordinate =
  | readonly [dimension: string, id: string]
  | undefined;

export function slotCoordinate(
  dimension: string | undefined,
  header: HeaderItem | undefined,
): ItemCoordinate {
  return dimension === undefined || header === undefined
    ? undefined
    : [dimension, header.id];
}

// Undefined when no coordinate is defined, never `{}`, so primitives that
// stand for no data member never share an item.
export function buildItem(
  coordinates: readonly ItemCoordinate[],
): PrimitiveItem | undefined {
  const item: Record<string, string> = {};
  for (const coordinate of coordinates) {
    if (coordinate === undefined) {
      continue;
    }
    const [dimension, id] = coordinate;
    if (Object.hasOwn(item, dimension)) {
      throw new Error(`Item names dimension "${dimension}" twice`);
    }
    item[dimension] = id;
  }
  return Object.keys(item).length > 0 ? item : undefined;
}

// The item's [dimension, id] pairs sorted by dimension in code-unit order
// (never localeCompare, which varies by locale), encoded as JSON, so no two
// items share a key whatever their ids contain.
export function computeItemKey(item: PrimitiveItem): string {
  return JSON.stringify(
    Object.keys(item).sort().map((dimension) => [dimension, item[dimension]]),
  );
}
