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
  ProcessedData,
  SortConfig,
  TableColumn,
  TableProps,
} from "./types.ts";
import {
  getCellAlignment,
  getPaddingClasses,
  groupData,
  sortData,
} from "./helpers.ts";
import { Button, Checkbox } from "../../form_inputs/mod.ts";

// ============================================================================
// Main Table Component
// ============================================================================

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

  // Use controlled state if provided, otherwise use internal state
  const isControlled = !!(p.selectedKeys && p.setSelectedKeys);
  const selectedKeys = isControlled ? p.selectedKeys! : internalSelectedKeys;
  const setSelectedKeys = isControlled
    ? p.setSelectedKeys!
    : setInternalSelectedKeys;

  // Compute selection states
  const allSelected = createMemo(() => {
    const selected = selectedKeys();
    return selected.size > 0 && selected.size === p.data.length;
  });

  const someSelected = createMemo(() => {
    const selected = selectedKeys();
    return selected.size > 0 && selected.size < p.data.length;
  });

  // Process data with sorting and grouping
  const processedData = createMemo((): ProcessedData<T> => {
    const currentGroup = p.currentGroup;
    const group = p.groups?.find((g) => g.key === currentGroup);

    if (group) {
      return groupData(p.data, group, sortConfig(), p.columns);
    }

    const sorted = sortData(p.data, sortConfig(), p.columns);
    return {
      isGrouped: false,
      groups: [],
      allItems: sorted,
    };
  });

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
    if (allSelected()) {
      setSelectedKeys(new Set());
    } else {
      const allKeys = p.data.map((item) => item[p.keyField]);
      setSelectedKeys(new Set(allKeys));
    }
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
    !!(p.bulkActions && p.bulkActions.length > 0) || isControlled;

  const padding = createMemo(() =>
    getPaddingClasses(p.paddingX || "normal", p.paddingY || "normal")
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
    <div
      class={p.fitTableToAvailableHeight
        ? "flex h-full w-full flex-col"
        : "w-full"}
    >
      <Show when={enableSelection() && selectedItems().length > 0}>
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
      <div
        class={p.fitTableToAvailableHeight
          ? "min-h-0 flex-shrink overflow-hidden"
          : "overflow-hidden"}
      >
        <div
          ref={scrollContainerRef}
          onScroll={() => p.onScrollTopChange?.(scrollContainerRef!.scrollTop)}
          class={p.fitTableToAvailableHeight
            ? "h-full overflow-x-auto overflow-y-auto rounded border"
            : "overflow-x-auto rounded border"}
          style={{
            ...(p.tableContentMaxHeight && {
              "max-height": p.tableContentMaxHeight,
              "overflow-y": "auto",
            }),
          }}
        >
          <table class="min-w-full table-auto border-collapse">
            <thead
              class="bg-base-200"
              style={{
                ...((p.tableContentMaxHeight ||
                  p.fitTableToAvailableHeight) && {
                  position: "sticky",
                  top: "0",
                  "z-index": "10",
                }),
              }}
            >
              <tr>
                <Show when={enableSelection()}>
                  <th
                    class={`text-base-content w-4 ${padding().px} py-3 text-left text-xs font-700 uppercase tracking-wider`}
                  >
                    <Checkbox
                      checked={allSelected()}
                      indeterminate={someSelected()}
                      onChange={toggleSelectAll}
                      label=""
                    />
                  </th>
                </Show>
                <For each={p.columns}>
                  {(column) => (
                    <th
                      class={`${padding().px} py-3 ${
                        getCellAlignment(
                          column.alignH,
                        )
                      } font-700 text-base-content text-xs uppercase tracking-wider ${
                        column.sortable ? "ui-hoverable-base-200" : ""
                      }`}
                      style={{ width: column.width }}
                      onClick={() => handleSort(column)}
                    >
                      <span class="inline-flex items-center gap-1">
                        {column.header}
                        <SortIcon column={column} sortConfig={sortConfig} />
                      </span>
                    </th>
                  )}
                </For>
              </tr>
            </thead>
            <tbody class="bg-base-100">
              <Switch>
                <Match when={p.data.length === 0}>
                  <tr>
                    <td
                      colspan={p.columns.length + (enableSelection() ? 1 : 0)}
                      class="text-base-content-muted px-4 py-8 text-center text-sm"
                    >
                      {p.noRowsMessage ||
                        t3({
                          en: "No data available",
                          fr: "Aucune donnée disponible",
                          pt: "Sem dados disponíveis",
                        })}
                    </td>
                  </tr>
                </Match>
                <Match when={processedData().isGrouped}>
                  <GroupedRows
                    processedData={processedData()}
                    columns={p.columns}
                    keyField={p.keyField}
                    enableSelection={enableSelection()}
                    selectedKeys={selectedKeys()}
                    onToggleSelection={toggleSelection}
                    onRowClick={p.onRowClick}
                    padding={padding()}
                  />
                </Match>
                <Match when={!processedData().isGrouped}>
                  <For each={processedData().allItems}>
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

// ============================================================================
// Sub-components
// ============================================================================

type SortIconProps<T> = {
  column: TableColumn<T>;
  sortConfig: () => SortConfig | null;
};

const SortIcon = <T,>(p: SortIconProps<T>) => {
  return (
    <Show when={p.column.sortable}>
      <span class="text-base-content ml-1 inline-block">
        {(() => {
          const config = p.sortConfig();
          const isActive = config?.key === p.column.key;
          const isAsc = config?.direction === "asc";

          if (isActive) {
            return isAsc ? "↑" : "↓";
          }
          return <span class="opacity-40">↕</span>;
        })()}
      </span>
    </Show>
  );
};

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

const TableRow = <T extends AnyRow, K extends keyof T = keyof T>(
  p: TableRowProps<T, K>,
) => {
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
              label=""
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
};

type GroupedRowsProps<T, K extends keyof T = keyof T> = {
  processedData: ProcessedData<T>;
  columns: TableColumn<T>[];
  keyField: K;
  enableSelection: boolean;
  selectedKeys: Set<T[K]>;
  onToggleSelection: (key: T[K]) => void;
  onRowClick?: (item: T) => void;
  padding: { px: string; py: string };
};

const GroupedRows = <
  T extends AnyRow,
  K extends keyof T = keyof T,
>(
  p: GroupedRowsProps<T, K>,
) => {
  return (
    <Show when={p.processedData.isGrouped}>
      <For each={p.processedData.groups}>
        {(group) => (
          <>
            <tr class="bg-base-200">
              <td
                colspan={p.columns.length + (p.enableSelection ? 1 : 0)}
                class={`text-base-content border-t ${p.padding.px} ${p.padding.py} text-sm font-700 uppercase tracking-wider`}
              >
                {group.label}
              </td>
            </tr>
            <For each={group.items}>
              {(item) => (
                <TableRow
                  item={item}
                  columns={p.columns}
                  keyField={p.keyField}
                  enableSelection={p.enableSelection}
                  selectedKeys={p.selectedKeys}
                  onToggleSelection={p.onToggleSelection}
                  onRowClick={p.onRowClick}
                  padding={p.padding}
                />
              )}
            </For>
          </>
        )}
      </For>
    </Show>
  );
};
