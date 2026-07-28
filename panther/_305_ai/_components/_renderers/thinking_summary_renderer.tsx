// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Icon, Show, t3 } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export function ThinkingSummaryRenderer(p: {
  item: Extract<DisplayItem, { type: "thinking_summary" }>;
}) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="text-base-content-muted hover:text-base-content flex w-full cursor-pointer items-start gap-1 text-left text-xs"
      >
        <div class="mt-0.5">
          {expanded()
            ? <Icon iconName="chevronDown" class="h-3 w-3" />
            : <Icon iconName="chevronRight" class="h-3 w-3" />}
        </div>
        <span class="italic">
          {t3({ en: "Thinking", fr: "Réflexion", pt: "Raciocínio" })}
        </span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1 whitespace-pre-wrap text-xs italic">
          {p.item.text}
        </div>
      </Show>
    </div>
  );
}
