// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, Show } from "solid-js";
import { t3 } from "../../deps.ts";
import { computeGroupSpans } from "../_internal/group_spans.ts";
import type { PresenceGridProps } from "./types.ts";

// Presence, not magnitude: a cell is filled where the row has presence in the
// column. A DOM grid rather than a figure: hover comes from the title
// attribute.
export function PresenceGrid(p: PresenceGridProps) {
  const groupSpans = createMemo(() =>
    p.columnGroups === undefined
      ? undefined
      : computeGroupSpans(p.columns, p.columnGroups)
  );

  const noData = () =>
    t3({ en: "no data", fr: "aucune donnée", pt: "sem dados" });

  const swatchWidth = () =>
    p.cellWidth === "stretch" ? "w-full min-w-4" : "w-4";

  return (
    <div class="w-fit max-w-full max-h-full overflow-auto">
      <table class="border-separate border-spacing-0 text-xs">
        <thead class="bg-base-100 sticky top-0 z-20">
          <tr class="h-5">
            <th class="bg-base-100 sticky left-0 z-30" />
            <Show
              when={p.columnGroups !== undefined}
              fallback={
                <For each={p.columns}>
                  {(column) => (
                    <th class="font-400 px-2 pb-1 text-center align-bottom">
                      {column.label}
                    </th>
                  )}
                </For>
              }
            >
              <For each={groupSpans()}>
                {(group) => (
                  <th
                    colSpan={group.span}
                    class="border-base-300 font-400 border-l pl-1 text-left align-bottom"
                  >
                    {group.label}
                  </th>
                )}
              </For>
            </Show>
          </tr>
        </thead>
        <tbody>
          <For each={p.rows}>
            {(row, rowIndex) => (
              <tr>
                <td
                  class="bg-base-100 sticky left-0 z-10 max-w-64 truncate pr-2 pl-0"
                  title={row.label}
                >
                  {row.label}
                </td>
                <For each={p.columns}>
                  {(column, columnIndex) => {
                    const filled = () =>
                      p.cells[rowIndex()]?.[columnIndex()] === true;
                    return (
                      <td class="p-px">
                        <div
                          class={`h-4 rounded-sm border ${swatchWidth()} ${
                            filled()
                              ? "bg-success border-success"
                              : "border-base-300"
                          }`}
                          title={`${row.label} · ${column.label}${
                            filled() ? "" : ` · ${noData()}`
                          }`}
                        />
                      </td>
                    );
                  }}
                </For>
              </tr>
            )}
          </For>
        </tbody>
      </table>
    </div>
  );
}
