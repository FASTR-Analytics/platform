// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createMemo,
  createSignal,
  For,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import { t3 } from "../../deps.ts";
import type {
  AnyRow,
  BulkAction,
  FilterConfig,
  SortConfig,
  TableColumn,
  TableProps,
} from "./types.ts";
import {
  filterData,
  getCellAlignment,
  getPaddingClasses,
  sortData,
} from "./helpers.ts";
import { ColumnFilter } from "./column_filter.tsx";
import { HeaderGlyph } from "./header_glyph.tsx";
import { Button, Checkbox } from "../../form_inputs/mod.ts";
import { EmptyState } from "../../display/mod.ts";

// Shared by every control in a header cell so they are the same height.
const HEADER_BUTTON =
  "inline-flex items-center gap-1 rounded px-1.5 py-1 uppercase ui-hoverable-base-200 ui-focusable";

function getHeaderJustify(alignH?: TableColumn<unknown>["alignH"]): string {
  switch (alignH) {
    case "center":
      return "justify-center";
    case "right":
      return "justify-end";
    default:
      return "justify-start";
  }
}

// Pulls the row's edge element back by the button's own padding so the label
// text (left) or the trailing glyph (right) sits exactly over the cell content
// below it. The edge element on the right is the filter button when present.
function getHeaderEdgeMargins(
  alignH: TableColumn<unknown>["alignH"],
  filterable: boolean,
): { label: string; filter: string } {
  switch (alignH) {
    case "center":
      return { label: "", filter: "" };
    case "right":
      return filterable
        ? { label: "", filter: "-mr-1.5" }
        : { label: "-mr-1.5", filter: "" };
    default:
      return { label: "-ml-1.5", filter: "" };
  }
}

const EMPTY_EXCLUDED: ReadonlySet<string> = new Set();

export function Table<
  T extends AnyRow,
  K extends keyof T = keyof T,
>(p: TableProps<T, K>) {
  const [sortConfig, setSortConfig] = createSignal<SortConfig | null>(
    p.defaultSort || null,
  );
  const [internalSelectedKeys, setInternalSelectedKeys] = createSignal<
    Set<T[K]>
  >(new Set());

  // Use controlled state if provided, otherwise use internal state. Resolved
  // per call so a parent toggling controlled/uncontrolled (or swapping the
  // accessor identity) is picked up reactively.
  const isControlled = () => !!(p.selectedKeys && p.setSelectedKeys);
  const selectedKeys = () =>
    isControlled() ? p.selectedKeys!() : internalSelectedKeys();
  const setSelectedKeys = (keys: Set<T[K]>) => {
    if (isControlled()) {
      p.setSelectedKeys!(keys);
    } else {
      setInternalSelectedKeys(keys);
    }
  };

  const [filters, setFilters] = createSignal<FilterConfig>(
    p.defaultFilters ?? new Map(),
  );
  const visibleRows = createMemo(() =>
    filterData(p.data, filters(), p.columns)
  );

  const replaceFilters = (next: FilterConfig) => {
    setFilters(next);
    p.onFilterChange?.(next);
  };

  const updateFilter = (key: string, excluded: ReadonlySet<string>) => {
    const next = new Map(filters());
    if (excluded.size === 0) {
      next.delete(key);
    } else {
      next.set(key, excluded);
    }
    replaceFilters(next);
  };

  // A selected row hidden by a filter stays selected, so the header checkbox
  // reflects visible rows by membership, not by comparing counts.
  const allSelected = createMemo(() => {
    const selected = selectedKeys();
    const rows = visibleRows();
    return rows.length > 0 &&
      rows.every((item) => selected.has(item[p.keyField]));
  });

  const someSelected = createMemo(() => {
    const selected = selectedKeys();
    return !allSelected() &&
      visibleRows().some((item) => selected.has(item[p.keyField]));
  });

  const rows = createMemo(() =>
    sortData(visibleRows(), sortConfig(), p.columns)
  );

  // Handle sorting
  const handleSort = (column: TableColumn<T>) => {
    if (!column.sortable) return;

    const prev = sortConfig();
    const newConfig: SortConfig = prev?.key === column.key
      ? {
        key: column.key,
        direction: prev.direction === "asc" ? "desc" : "asc",
      }
      : { key: column.key, direction: "asc" };

    setSortConfig(newConfig);
    p.onSortChange?.(newConfig);
  };

  // Handle selection
  const toggleSelection = (key: T[K]) => {
    const prev = selectedKeys();
    const newSet = new Set(prev);
    if (newSet.has(key)) {
      newSet.delete(key);
    } else {
      newSet.add(key);
    }
    setSelectedKeys(newSet);
  };

  const toggleSelectAll = () => {
    const next = new Set(selectedKeys());
    const deselect = allSelected();
    for (const item of visibleRows()) {
      if (deselect) {
        next.delete(item[p.keyField]);
      } else {
        next.add(item[p.keyField]);
      }
    }
    setSelectedKeys(next);
  };

  // Get selected items
  const selectedItems = createMemo(() => {
    const selected = selectedKeys();
    if (selected.size === 0) return [];
    return p.data.filter((item) => selected.has(item[p.keyField]));
  });

  // Handle bulk action
  const handleBulkAction = async (action: BulkAction<T>) => {
    const result = await action.onClick(selectedItems());
    if (result === true || result === "CLEAR_SELECTION") {
      setSelectedKeys(new Set()); // Clear selection after action
    }
  };

  // Check if selection should be enabled
  const enableSelection = () =>
    !!(p.bulkActions && p.bulkActions.length > 0) || isControlled();
  // The bar exists for the bulk actions; a controlled table without any
  // clears its selection with the header checkbox.
  const showBulkActionBar = () =>
    !!(p.bulkActions && p.bulkActions.length > 0) &&
    selectedItems().length > 0;

  const padding = createMemo(() =>
    getPaddingClasses(p.paddingX ?? "normal", p.paddingY ?? "normal")
  );

  // Restore needs real layout — under a display:none ancestor scrollHeight is 0
  // and the write is a silent no-op (hide with visibility:hidden instead).
  let scrollContainerRef: HTMLDivElement | undefined;
  onMount(() => {
    if (p.initialScrollTop && scrollContainerRef) {
      scrollContainerRef.scrollTop = p.initialScrollTop;
    }
  });

  return (
    <div class="flex max-h-full w-full flex-col">
      <Show when={showBulkActionBar()}>
        <div class="ui-pad ui-gap bg-base-100 mb-4 flex items-center rounded border">
          <span class="font-700 flex-none text-sm">
            {selectedItems().length}{" "}
            {p.selectionLabel || t3({ en: "item", fr: "élément", pt: "item" })}
            {selectedItems().length !== 1 ? "s" : ""}{" "}
            {selectedItems().length !== 1
              ? t3({ en: "selected", fr: "sélectionnés", pt: "selecionados" })
              : t3({ en: "selected", fr: "sélectionné", pt: "selecionado" })}
          </span>
          <div class="flex items-center gap-2">
            <For each={p.bulkActions}>
              {(action) => (
                <Button
                  onClick={() => handleBulkAction(action)}
                  intent={action.intent || "neutral"}
                  outline={action.outline}
                  state={action.state?.()}
                >
                  {action.label}
                </Button>
              )}
            </For>
            <Button
              onClick={() => {
                setSelectedKeys(new Set());
              }}
              intent="neutral"
              outline
            >
              {t3({
                en: "Clear selection",
                fr: "Effacer la sélection",
                pt: "Limpar seleção",
              })}
            </Button>
          </div>
        </div>
      </Show>
      <div class="flex min-h-0 flex-col overflow-hidden">
        <div
          ref={scrollContainerRef}
          onScroll={() => p.onScrollTopChange?.(scrollContainerRef!.scrollTop)}
          class="min-h-0 overflow-auto rounded border"
          style={{ "max-height": p.tableContentMaxHeight }}
        >
          <table class="min-w-full table-auto border-collapse">
            <thead class="bg-base-200 sticky top-0 z-10">
              <tr>
                <Show when={enableSelection()}>
                  <th
                    class={`text-base-content w-4 ${padding().px} py-3 text-left text-xs font-700 uppercase tracking-wider`}
                  >
                    <Checkbox
                      checked={allSelected()}
                      indeterminate={someSelected()}
                      onChange={toggleSelectAll}
                    />
                  </th>
                </Show>
                <For each={p.columns}>
                  {(column) => {
                    const margins = () =>
                      getHeaderEdgeMargins(column.alignH, !!column.filterable);
                    return (
                      <th
                        class={`${padding().px} py-2 font-700 text-base-content text-xs uppercase tracking-wider`}
                        style={{ width: column.width }}
                        aria-sort={column.sortable
                          ? (sortConfig()?.key === column.key
                            ? (sortConfig()?.direction === "asc"
                              ? "ascending"
                              : "descending")
                            : "none")
                          : undefined}
                      >
                        <div
                          class={`flex items-stretch gap-0.5 ${
                            getHeaderJustify(column.alignH)
                          }`}
                        >
                          <Show
                            when={column.sortable}
                            fallback={
                              <span
                                class={`px-1.5 py-1 ${
                                  getCellAlignment(column.alignH)
                                } ${margins().label}`}
                              >
                                {column.header}
                              </span>
                            }
                          >
                            <button
                              type="button"
                              class={`${HEADER_BUTTON} ${
                                getCellAlignment(column.alignH)
                              } ${margins().label}`}
                              onClick={() => handleSort(column)}
                            >
                              {column.header}
                              <SortIcon
                                column={column}
                                sortConfig={sortConfig}
                              />
                            </button>
                          </Show>
                          <Show when={column.filterable}>
                            <ColumnFilter
                              column={column}
                              data={p.data}
                              excluded={filters().get(column.key) ??
                                EMPTY_EXCLUDED}
                              onChange={(next) =>
                                updateFilter(column.key, next)}
                              scrollContainer={() => scrollContainerRef}
                              class={`${HEADER_BUTTON} ${margins().filter}`}
                            />
                          </Show>
                        </div>
                      </th>
                    );
                  }}
                </For>
              </tr>
            </thead>
            <tbody class="bg-base-100">
              <Switch>
                <Match when={p.data.length === 0}>
                  <tr>
                    <td
                      colspan={p.columns.length + (enableSelection() ? 1 : 0)}
                    >
                      <EmptyState
                        title={p.noRowsMessage ||
                          t3({
                            en: "No data available",
                            fr: "Aucune donnée disponible",
                            pt: "Sem dados disponíveis",
                          })}
                      />
                    </td>
                  </tr>
                </Match>
                <Match when={visibleRows().length === 0}>
                  <tr>
                    <td
                      colspan={p.columns.length + (enableSelection() ? 1 : 0)}
                    >
                      <EmptyState
                        title={t3({
                          en: "No rows match the current filters",
                          fr: "Aucune ligne ne correspond aux filtres",
                          pt: "Nenhuma linha corresponde aos filtros",
                        })}
                      >
                        <Button
                          intent="neutral"
                          outline
                          onClick={() => replaceFilters(new Map())}
                        >
                          {t3({
                            en: "Clear filters",
                            fr: "Effacer les filtres",
                            pt: "Limpar filtros",
                          })}
                        </Button>
                      </EmptyState>
                    </td>
                  </tr>
                </Match>
                <Match when={rows().length > 0}>
                  <For each={rows()}>
                    {(item) => (
                      <TableRow
                        item={item}
                        columns={p.columns}
                        keyField={p.keyField}
                        enableSelection={enableSelection()}
                        selectedKeys={selectedKeys()}
                        onToggleSelection={toggleSelection}
                        onRowClick={p.onRowClick}
                        padding={padding()}
                      />
                    )}
                  </For>
                </Match>
              </Switch>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

type SortIconProps<T> = {
  column: TableColumn<T>;
  sortConfig: () => SortConfig | null;
};

function SortIcon<T>(p: SortIconProps<T>) {
  const isActive = () => p.sortConfig()?.key === p.column.key;
  const isAsc = () => p.sortConfig()?.direction === "asc";

  return (
    <Show when={p.column.sortable}>
      <HeaderGlyph
        class="ml-1"
        muted={!isActive()}
        iconName={isActive()
          ? (isAsc() ? "arrowUp" : "arrowDown")
          : "arrowsUpDown"}
      />
    </Show>
  );
}

type TableRowProps<T, K extends keyof T = keyof T> = {
  item: T;
  columns: TableColumn<T>[];
  keyField: K;
  enableSelection: boolean;
  selectedKeys: Set<T[K]>;
  onToggleSelection: (key: T[K]) => void;
  onRowClick?: (item: T) => void;
  padding: { px: string; py: string };
};

function TableRow<T extends AnyRow, K extends keyof T = keyof T>(
  p: TableRowProps<T, K>,
) {
  const key = () => p.item[p.keyField];

  const rowClasses = () => {
    const classes = ["group", "border-t"];

    if (p.onRowClick) {
      // Explicit pair, not ui-hoverable-base-100: the family carries
      // select-none, which would break selecting/copying cell text.
      classes.push(
        "hover:bg-base-100-hover",
        "active:bg-base-100-active",
        "cursor-pointer",
      );
    }

    return classes.join(" ");
  };

  return (
    <tr
      class={rowClasses()}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (
          !p.enableSelection ||
          (target.tagName !== "INPUT" && !target.closest("label"))
        ) {
          p.onRowClick?.(p.item);
        }
      }}
    >
      <Show when={p.enableSelection}>
        <td class={`w-4 ${p.padding.px} ${p.padding.py}`}>
          <div onClick={(e) => e.stopPropagation()}>
            <Checkbox
              checked={p.selectedKeys.has(key())}
              onChange={() => p.onToggleSelection(key())}
            />
          </div>
        </td>
      </Show>
      <For each={p.columns}>
        {(column) => (
          <td
            class={`${p.padding.px} ${p.padding.py} ${
              getCellAlignment(
                column.alignH,
              )
            } text-sm`}
            style={{ width: column.width }}
          >
            <Show when={column.render} fallback={String(p.item[column.key])}>
              {column.render!(p.item)}
            </Show>
          </td>
        )}
      </For>
    </tr>
  );
}
