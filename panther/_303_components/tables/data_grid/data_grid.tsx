// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js";
import { computeGroupSpans } from "../_internal/group_spans.ts";
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

// Valued cells first, by value; then value-less cells, by text; empties last.
// Ranking before comparing keeps the order transitive in a mixed column.
function cellRank(cell: DataGridCell | undefined): number {
  return cell === undefined ? 2 : cell.value === undefined ? 1 : 0;
}

function compareCells(
  a: DataGridCell | undefined,
  b: DataGridCell | undefined,
): number {
  const rank = cellRank(a) - cellRank(b);
  if (rank !== 0 || a === undefined || b === undefined) return rank;
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
    // Empties stay last in both directions; only the valued order flips.
    return indices.sort((a, b) => {
      const cellA = p.cells[a]?.[col];
      const cellB = p.cells[b]?.[col];
      const rank = cellRank(cellA) - cellRank(cellB);
      return rank !== 0 ? rank : sign * compareCells(cellA, cellB);
    });
  });

  const groupSpans = createMemo(() =>
    p.columnGroups === undefined
      ? undefined
      : computeGroupSpans(p.columns, p.columnGroups)
  );

  const headerCells = new Map<string, HTMLTableCellElement>();
  let scroller: HTMLDivElement | undefined;
  let rowHeaderCell: HTMLTableCellElement | undefined;
  createEffect(() => {
    const id = p.focusColumnId;
    if (id === undefined || id === null) return;
    const target = headerCells.get(id);
    if (target === undefined) return;
    // The sticky row-header column covers the scroller's left edge, so a
    // column scrolled to that edge would land underneath it.
    if (scroller !== undefined && rowHeaderCell !== undefined) {
      scroller.style.scrollPaddingLeft = `${rowHeaderCell.offsetWidth}px`;
    }
    target.scrollIntoView({ inline: "nearest", block: "nearest" });
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
      ref={scroller}
      class="w-fit max-w-full max-h-full overflow-auto rounded border"
      style={{ "max-height": p.maxHeight }}
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
            <th
              ref={rowHeaderCell}
              class="bg-base-200 sticky left-0 z-30 border-b border-r px-1 py-1 text-left"
            >
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
              {(column) => {
                onCleanup(() => headerCells.delete(column.id));
                return (
                  <th
                    ref={(el) => headerCells.set(column.id, el)}
                    class="border-b border-r px-1 py-1 align-bottom"
                  >
                    <button
                      type="button"
                      class={HEADER_BUTTON}
                      classList={{
                        "bg-base-200-hover": p.focusColumnId === column.id,
                      }}
                      onClick={() => toggleSort(column.id)}
                    >
                      <span class="flex-1 whitespace-nowrap text-right font-700">
                        {column.label}
                      </span>
                      {sortGlyph(column.id)}
                    </button>
                  </th>
                );
              }}
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
                  onMouseEnter={() => p.onCellHover?.(null)}
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
