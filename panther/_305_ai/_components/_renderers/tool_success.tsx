// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Icon, Show, t3 } from "../../deps.ts";
import type { DisplayItem } from "../../_core/types.ts";

export function AIChatToolSuccess(p: {
  item: Extract<DisplayItem, { type: "tool_success" }>;
}) {
  const [expanded, setExpanded] = createSignal(false);

  return (
    <div class="my-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded())}
        class="text-success-subtle-content hover:text-success flex w-full cursor-pointer items-start gap-1 text-left text-sm transition-colors"
      >
        <div class="mt-0.5">
          <Icon
            iconName={expanded() ? "chevronDown" : "chevronRight"}
            class="h-4 w-4"
          />
        </div>
        <span class="italic">{p.item.message}</span>
      </button>

      <Show when={expanded()}>
        <div class="ml-5 mt-1 space-y-2">
          <div>
            <div class="text-success-subtle-content mb-1 text-xs font-700">
              {t3({
                en: `Input (${p.item.toolName}):`,
                fr: `Entrée (${p.item.toolName}) :`,
                pt: `Entrada (${p.item.toolName}):`,
                th: `อินพุต (${p.item.toolName}):`,
              })}
            </div>
            <div class="text-success-subtle-content bg-success-subtle whitespace-pre-wrap rounded p-2 font-mono text-xs">
              {JSON.stringify(p.item.toolInput, null, 2)}
            </div>
          </div>
          <div>
            <div class="text-success-subtle-content mb-1 text-xs font-700">
              {t3({
                en: "Result:",
                fr: "Résultat :",
                pt: "Resultado:",
                th: "ผลลัพธ์:",
              })}
            </div>
            <div class="text-success-subtle-content bg-success-subtle whitespace-pre-wrap rounded p-2 font-mono text-xs">
              {p.item.result}
            </div>
          </div>
        </div>
      </Show>
    </div>
  );
}
