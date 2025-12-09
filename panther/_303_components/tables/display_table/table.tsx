// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  batch,
  Component,
  createMemo,
  createSignal,
  For,
  Match,
  Show,
  Switch,
} from "solid-js";
import type {
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

export function Table<T extends Record<string, any>>(p: TableProps<T>) {
  const [sortConfig, setSortConfig] = createSignal<SortConfig | null>(
    p.defaultSort || null,
  );
  const [internalSelectedKeys, setInternalSelectedKeys] = createSignal<
    Set<any>
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
      return groupData(p.data, group, sortConfig());
    }

    const sorted = sortData(p.data, sortConfig());
    return {
      isGrouped: false,
      groups: [],
      allItems: sorted,
    };
  });

  // Handle sorting
  const handleSort = (column: TableColumn<T>) => {
    if (!column.sortable) return;

    setSortConfig((prev) => {
      if (prev?.key === column.key) {
        return {
          key: column.key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key: column.key, direction: "asc" };
    });
  };

  // Handle selection
  const toggleSelection = (key: any) => {
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

  return (
    <div
      class={p.fitTableToAvailableHeight
        ? "flex h-full w-full flex-col"
        : "w-full"}
    >
      <Show when={enableSelection() && selectedItems().length > 0}>
        <div class="ui-pad ui-gap bg-base-100 border-base-300 mb-4 flex items-center rounded border">
          <span class="font-700 flex-none text-sm">
            {selectedItems().length} {p.selectionLabel || "item"}
            {selectedItems().length !== 1 ? "s" : ""} selected
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
              Clear selection
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
          class={p.fitTableToAvailableHeight
            ? "border-base-300 h-full overflow-x-auto overflow-y-auto rounded border"
            : "border-base-300 overflow-x-auto rounded border"}
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
                    class={`text-base-content w-4 ${padding().px} py-3 text-left text-xs font-medium uppercase tracking-wider`}
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
                          column.align,
                        )
                      } font-700 text-base-content text-xs uppercase tracking-wider ${
                        column.sortable
                          ? "hover:bg-base-300/30 cursor-pointer select-none"
                          : ""
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
                      class="text-neutral px-4 py-8 text-center text-sm"
                    >
                      {p.noRowsMessage || "No data available"}
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

type TableRowProps<T> = {
  item: T;
  columns: TableColumn<T>[];
  keyField: keyof T;
  enableSelection: boolean;
  selectedKeys: Set<any>;
  onToggleSelection: (key: any) => void;
  onRowClick?: (item: T) => void;
  padding: { px: string; py: string };
};

const TableRow: Component<TableRowProps<any>> = (p) => {
  const key = () => p.item[p.keyField];

  const rowClasses = () => {
    const classes = ["group", "border-t", "border-base-300"];

    if (p.onRowClick) {
      classes.push("hover:bg-base-200/50", "cursor-pointer");
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
                column.align,
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

type GroupedRowsProps<T> = {
  processedData: ProcessedData<T>;
  columns: TableColumn<T>[];
  keyField: keyof T;
  enableSelection: boolean;
  selectedKeys: Set<any>;
  onToggleSelection: (key: any) => void;
  onRowClick?: (item: T) => void;
  padding: { px: string; py: string };
};

const GroupedRows: Component<GroupedRowsProps<any>> = (p) => {
  return (
    <Show when={p.processedData.isGrouped}>
      <For each={p.processedData.groups}>
        {(group) => (
          <>
            <tr class="bg-base-200">
              <td
                colspan={p.columns.length + (p.enableSelection ? 1 : 0)}
                class={`border-base-300 text-base-content border-t ${p.padding.px} ${p.padding.py} text-sm font-semibold uppercase tracking-wider`}
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
