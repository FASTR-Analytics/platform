// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { LayoutNode } from "./types.ts";

export function updateLayout<U>(
  layout: LayoutNode<U>,
  recipe: (draft: LayoutNode<U>) => void,
): LayoutNode<U> {
  const draft = structuredClone(layout);
  recipe(draft);
  return draft;
}
