// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, createSignal, For, Show } from "solid-js";
import { HeaderGlyph } from "../display_table/header_glyph.tsx";
import type {
  DataGridCell,
  DataGridHit,
  DataGridProps,
  DataGridSort,
} from "./types.ts";

export const ROW_HEADER_COLUMN_ID = "__row_header__";

const HEADER_BUTTON =
  "inline-flex w-full items-center gap-1 rounded px-1.5 py-1 ui-hoverable-base-200 ui-focusable";

function compareCells(
  a: DataGridCell | undefined,
  b: DataGridCell | undefined,
): number {
  if (a === undefined) return b === undefined ? 0 : 1;
  if (b === undefined) return -1;
  if (a.value !== undefined && b.value !== undefined) return a.value - b.value;
  return a.text.localeCompare(b.text);
}

export function DataGrid(p: DataGridProps) {
  const [sort, setSort] = createSignal<DataGridSort | null>(
    p.defaultSort ?? null,
  );

  const columnIndex = createMemo(
    () => new Map(p.columns.map((c, i) => [c.id, i])),
  );

  // Row order only: cells stay addressed by the row's original index so the
  // matrix is never copied.
  const orderedRowIndices = createMemo(() => {
    const indices = p.rows.map((_, i) => i);
    const s = sort();
    if (s === null) return indices;
    const sign = s.direction === "asc" ? 1 : -1;
    if (s.columnId === ROW_HEADER_COLUMN_ID) {
      return indices.sort((a, b) =>
        sign * p.rows[a].label.localeCompare(p.rows[b].label)
      );
    }
    const col = columnIndex().get(s.columnId);
    if (col === undefined) return indices;
    return indices.sort((a, b) => {
      const cmp = compareCells(p.cells[a]?.[col], p.cells[b]?.[col]);
      const bothEmpty = p.cells[a]?.[col] === undefined &&
        p.cells[b]?.[col] === undefined;
      const oneEmpty = (p.cells[a]?.[col] === undefined) !==
        (p.cells[b]?.[col] === undefined);
      return bothEmpty ? 0 : oneEmpty ? cmp : sign * cmp;
    });
  });

  // Contiguous runs of one group id, in column order, so a group header spans
  // exactly the columns beneath it.
  const groupSpans = createMemo(() => {
    const groups = p.columnGroups;
    if (groups === undefined) return undefined;
    const labelById = new Map(groups.map((g) => [g.id, g.label]));
    const spans: { label: string; span: number }[] = [];
    for (const column of p.columns) {
      const label = column.groupId === undefined
        ? ""
        : labelById.get(column.groupId) ?? "";
      const last = spans.at(-1);
      if (
        last !== undefined && column.groupId !== undefined &&
        last.label === label
      ) {
        last.span += 1;
      } else {
        spans.push({ label, span: 1 });
      }
    }
    return spans;
  });

  const toggleSort = (columnId: string) => {
    const prev = sort();
    const next: DataGridSort = prev?.columnId === columnId
      ? { columnId, direction: prev.direction === "asc" ? "desc" : "asc" }
      : { columnId, direction: "asc" };
    setSort(next);
    p.onSortChange?.(next);
  };

  const sortGlyph = (columnId: string) => {
    const s = sort();
    return (
      <HeaderGlyph
        iconName={s?.columnId !== columnId
          ? "arrowsUpDown"
          : s.direction === "asc"
          ? "arrowUp"
          : "arrowDown"}
        muted={s?.columnId !== columnId}
      />
    );
  };

  const hit = (rowIndex: number, columnIndex: number): DataGridHit => ({
    rowId: p.rows[rowIndex].id,
    columnId: p.columns[columnIndex].id,
    cell: p.cells[rowIndex]?.[columnIndex],
  });

  return (
    <div
      class={p.fitToAvailableHeight
        ? "h-full w-full overflow-auto rounded border"
        : "w-full overflow-x-auto rounded border"}
    >
      <table class="ui-text-small border-separate border-spacing-0">
        <thead class="bg-base-200 sticky top-0 z-20">
          <Show when={groupSpans()} keyed>
            {(spans) => (
              <tr>
                <th class="bg-base-200 sticky left-0 z-30 border-b border-r" />
                <For each={spans}>
                  {(group) => (
                    <th
                      class="border-b border-r px-2 py-1 text-center font-700"
                      colSpan={group.span}
                    >
                      {group.label}
                    </th>
                  )}
                </For>
              </tr>
            )}
          </Show>
          <tr>
            <th class="bg-base-200 sticky left-0 z-30 border-b border-r px-1 py-1 text-left">
              <button
                type="button"
                class={HEADER_BUTTON}
                onClick={() => toggleSort(ROW_HEADER_COLUMN_ID)}
              >
                <span class="flex-1 truncate text-left font-700">
                  {p.rowHeaderLabel ?? ""}
                </span>
                {sortGlyph(ROW_HEADER_COLUMN_ID)}
              </button>
            </th>
            <For each={p.columns}>
              {(column) => (
                <th class="border-b border-r px-1 py-1 align-bottom">
                  <button
                    type="button"
                    class={HEADER_BUTTON}
                    onClick={() => toggleSort(column.id)}
                  >
                    <span class="flex-1 whitespace-nowrap text-right font-700">
                      {column.label}
                    </span>
                    {sortGlyph(column.id)}
                  </button>
                </th>
              )}
            </For>
          </tr>
        </thead>
        <tbody onMouseLeave={() => p.onCellHover?.(null)}>
          <For each={orderedRowIndices()}>
            {(rowIndex) => (
              <tr>
                <th
                  class="bg-base-100 sticky left-0 z-10 whitespace-nowrap border-b border-r px-3 py-1 text-left font-400"
                  classList={{
                    "cursor-pointer ui-hoverable-base-100": !!p.onRowClick,
                  }}
                  onClick={() => p.onRowClick?.(p.rows[rowIndex].id)}
                >
                  {p.rows[rowIndex].label}
                </th>
                <For each={p.columns}>
                  {(_, columnIdx) => {
                    const cell = () => p.cells[rowIndex]?.[columnIdx()];
                    return (
                      <td
                        class="whitespace-nowrap border-b border-r px-3 py-1 text-right"
                        classList={{ "cursor-pointer": !!p.onCellClick }}
                        style={{
                          "background-color": cell()?.bg,
                          color: cell()?.fg,
                        }}
                        onMouseEnter={() =>
                          p.onCellHover?.(hit(rowIndex, columnIdx()))}
                        onClick={() =>
                          p.onCellClick?.(hit(rowIndex, columnIdx()))}
                      >
                        {cell()?.text ?? ""}
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
