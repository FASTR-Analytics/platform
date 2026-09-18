// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Icon, type IconName } from "../../icons/mod.ts";

// One glyph treatment for every header control, so the sort and filter icons
// share a size, a family and a resting opacity.
export function HeaderGlyph(
  p: { iconName: IconName; muted: boolean; class?: string },
) {
  return (
    <span
      class={`text-base-content inline-flex ${p.class ?? ""}`}
      classList={{ "opacity-40": p.muted }}
    >
      <Icon iconName={p.iconName} />
    </span>
  );
}
