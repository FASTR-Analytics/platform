// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Icon, Show } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export function SystemNoticeRenderer(p: {
  item: Extract<DisplayItem, { type: "system_notice" }>;
}) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="text-neutral/80 hover:text-neutral flex w-full cursor-pointer items-start gap-1 text-left text-xs"
      >
        <div class="mt-0.5">
          {expanded()
            ? <Icon iconName="chevronDown" class="h-3 w-3" />
            : <Icon iconName="chevronRight" class="h-3 w-3" />}
        </div>
        <span class="font-medium">{p.item.message}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1 text-xs">{p.item.details}</div>
      </Show>
    </div>
  );
}
