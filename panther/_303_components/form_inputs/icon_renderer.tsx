// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import { _ICON_MAP, type IconName } from "../icons/mod.ts";

type IconRendererProps = {
  iconName?: IconName;
  invisible?: boolean;
  iconOnly?: boolean;
};

export function IconRenderer(p: IconRendererProps) {
  return (
    <Show when={p.iconName && _ICON_MAP[p.iconName]} keyed>
      {(KeyedIcon) => {
        return (
          <span
            class="data-[icon-only=true]:ui-icon-only-correction relative h-[1.25em] w-[1.25em] flex-none overflow-clip rounded data-[invisible=true]:invisible"
            data-invisible={p.invisible}
            data-icon-only={p.iconOnly}
          >
            <KeyedIcon />
          </span>
        );
      }}
    </Show>
  );
}
