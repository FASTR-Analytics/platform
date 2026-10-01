// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  createMemo,
  createSignal,
  For,
  type JSX,
  Match,
  onMount,
  Show,
  Switch,
} from "solid-js";
import {
  foldString,
  matchesSearch,
  plural,
  type PluralForms,
  searchTokens,
  t3,
} from "../../deps.ts";
import { padYClass, spyClass } from "../../_internal/pad_classes.ts";
import type {
  AnyRow,
  BulkAction,
  FilterConfig,
  SortConfig,
  TableColumn,
  TableProps,
} from "./types.ts";
import {
  buildSearchHaystacks,
  filterData,
  getCellAlignment,
  getPaddingClasses,
  searchData,
  sortData,
} from "./helpers.ts";
import { ColumnFilter } from "./column_filter.tsx";
import {
  _BulkActionButtons,
  getSelectionSentence,
} from "./selection_actions.tsx";
import { HeaderGlyph } from "./header_glyph.tsx";
import { Button, Checkbox, Input } from "../../form_inputs/mod.ts";
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

  const [internalSearchText, setInternalSearchText] = createSignal("");
  const searchText = () => p.searchText ?? internalSearchText();
  const setSearchText = (v: string) => {
    if (p.setSearchText) {
      p.setSearchText(v);
    } else {
      setInternalSearchText(v);
    }
  };
  const activeSearchTokens = createMemo(() => searchTokens(searchText()));
  const isSearching = createMemo(() => activeSearchTokens().length > 0);
  // Folded once per change of the rows, not per keystroke, and only while a
  // search is active, so a table that is never searched folds nothing.
  const searchHaystacks = createMemo(() =>
    isSearching()
      ? buildSearchHaystacks(p.data, p.columns, p.searchValue, foldString)
      : []
  );

  // The search runs first because its haystacks are parallel to p.data; both
  // steps keep row order, so the result is the same in either order.
  const visibleRows = createMemo(() =>
    filterData(
      searchData(
        p.data,
        searchHaystacks(),
        activeSearchTokens(),
        matchesSearch,
      ),
      filters(),
      p.columns,
    )
  );

  const replaceFilters = (next: FilterConfig) => {
    setFilters(next);
    p.onFilterChange?.(next);
  };

  const clearSearchAndFilters = () => {
    setSearchText("");
    if (filters().size > 0) {
      replaceFilters(new Map());
    }
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

  const itemLabel = () =>
    p.itemLabel ?? {
      one: t3({ en: "item", fr: "élément", pt: "item" }),
      other: t3({ en: "items", fr: "éléments", pt: "itens" }),
    };

  // Check if selection should be enabled
  const enableSelection = () =>
    !!(p.bulkActions && p.bulkActions.length > 0) || isControlled();
  // Read once: a toolbar literal in JSX is a getter that builds its children
  // anew on every access, so every reader shares one resolution.
  const toolbar = createMemo(() => p.toolbar);
  const showToolbar = () =>
    toolbar() !== undefined || !!(p.bulkActions && p.bulkActions.length > 0);
  const nested = () => toolbar()?.nested === true;

  const countText = () => {
    const n = p.data.length;
    const label = plural(n, itemLabel());
    const v = visibleRows().length;
    return v === n
      ? `${n} ${label}`
      : `${v} ${t3({ en: "of", fr: "sur", pt: "de" })} ${n} ${label}`;
  };

  const searchPlaceholder = () => {
    const search = toolbar()?.search;
    return (typeof search === "object" ? search.placeholder : undefined) ??
      t3({ en: "Search", fr: "Rechercher", pt: "Pesquisar" });
  };

  const padding = createMemo(() =>
    getPaddingClasses(p.paddingX ?? "normal", p.paddingY ?? "normal")
  );

  const floatingSpyClass = () => {
    const tb = toolbar();
    return showToolbar() && !tb?.nested ? spyClass(tb?.spy ?? "md") : "";
  };
  const nestedPadYClass = () => {
    const tb = toolbar();
    return padYClass(tb?.nested ? tb.pad ?? "md" : "md");
  };

  const toolbarRow = () => (
    <ToolbarRow
      selectedItems={selectedItems()}
      itemLabel={itemLabel()}
      countText={toolbar()?.count !== false ? countText() : undefined}
      search={!!toolbar()?.search}
      searchText={searchText()}
      setSearchText={setSearchText}
      searchPlaceholder={searchPlaceholder()}
      bulkActions={p.bulkActions ?? []}
      onClearSelection={() => setSelectedKeys(new Set())}
    >
      {toolbar()?.children}
    </ToolbarRow>
  );

  // Restore needs real layout — under a display:none ancestor scrollHeight is 0
  // and the write is a silent no-op (hide with visibility:hidden instead).
  let scrollContainerRef: HTMLDivElement | undefined;
  onMount(() => {
    if (p.initialScrollTop && scrollContainerRef) {
      scrollContainerRef.scrollTop = p.initialScrollTop;
    }
  });

  // min-h-0 on the root: as an item of a column flex parent it must be able to
  // shrink below its rows' height, or it overflows the parent instead of
  // scrolling.
  return (
    <div
      class={`flex max-h-full min-h-0 w-full flex-col ${floatingSpyClass()}`}
    >
      <Show when={showToolbar() && !nested()}>
        <div class="flex flex-none items-center">{toolbarRow()}</div>
      </Show>
      <div class="flex min-h-0 flex-col overflow-hidden rounded border">
        <Show when={showToolbar() && nested()}>
          <div
            class={`${padding().px} ${nestedPadYClass()} bg-base-100 flex flex-none items-center border-b`}
          >
            {toolbarRow()}
          </div>
        </Show>
        <div
          ref={scrollContainerRef}
          onScroll={() => p.onScrollTopChange?.(scrollContainerRef!.scrollTop)}
          class="min-h-0 overflow-auto"
          style={{ "max-height": p.maxHeight }}
        >
          <table class="min-w-full table-auto border-collapse">
            <Show when={!p.hideHeader}>
              <thead class="bg-base-200 sticky top-0 z-10">
                <tr>
                  <Show when={enableSelection()}>
                    <th
                      class={`text-base-content w-4 ${padding().px} ui-tablepad-y-header text-left text-xs font-700 uppercase tracking-wider`}
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
                        getHeaderEdgeMargins(
                          column.alignH,
                          !!column.filterable,
                        );
                      return (
                        <th
                          class={`${padding().px} ui-tablepad-y-header font-700 text-base-content text-xs uppercase tracking-wider`}
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
            </Show>
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
                <Match when={visibleRows().length === 0 && isSearching()}>
                  <tr>
                    <td
                      colspan={p.columns.length + (enableSelection() ? 1 : 0)}
                    >
                      <EmptyState
                        title={t3({
                          en: "No rows match your search",
                          fr: "Aucune ligne ne correspond à votre recherche",
                          pt: "Nenhuma linha corresponde à sua pesquisa",
                        })}
                      >
                        <Button
                          intent="neutral"
                          outline
                          onClick={clearSearchAndFilters}
                        >
                          {t3({
                            en: "Clear search",
                            fr: "Effacer la recherche",
                            pt: "Limpar pesquisa",
                          })}
                        </Button>
                      </EmptyState>
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
                    {(item, i) => (
                      <TableRow
                        item={item}
                        topBorder={!p.hideHeader || i() > 0}
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

type ToolbarRowProps<T> = {
  selectedItems: T[];
  itemLabel: PluralForms<string>;
  countText: string | undefined;
  search: boolean;
  searchText: string;
  setSearchText: (v: string) => void;
  searchPlaceholder: string;
  bulkActions: BulkAction<T>[];
  onClearSelection: () => void;
  children?: JSX.Element;
};

function ToolbarRow<T>(p: ToolbarRowProps<T>) {
  const hasSelection = () => p.selectedItems.length > 0;
  return (
    <div class="ui-gap flex min-h-[var(--ui-form-height)] w-full items-center">
      {/* The field precedes the text: the text changes width, and would move it. */}
      <Show when={p.search}>
        <div class="w-72 flex-none">
          <Input
            value={p.searchText}
            onChange={p.setSearchText}
            placeholder={p.searchPlaceholder}
            searchIcon
            clearable
            fullWidth
          />
        </div>
      </Show>
      <Switch>
        <Match when={hasSelection()}>
          <span class="font-700 flex-none text-sm">
            {getSelectionSentence(p.selectedItems.length, p.itemLabel)}
          </span>
        </Match>
        <Match when={p.countText !== undefined}>
          <span class="text-base-content-muted flex-none text-sm">
            {p.countText}
          </span>
        </Match>
      </Switch>
      <Switch>
        <Match when={hasSelection()}>
          <_BulkActionButtons
            items={p.selectedItems}
            actions={p.bulkActions}
            onClear={p.onClearSelection}
          />
        </Match>
        <Match when={p.children}>
          <div class="ml-auto ui-gap-sm flex items-center">
            {p.children}
          </div>
        </Match>
      </Switch>
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
  // Off for the first row of a headerless table, where the frame's border (or a
  // nested toolbar's) is the edge and a row border would double it.
  topBorder: boolean;
};

function TableRow<T extends AnyRow, K extends keyof T = keyof T>(
  p: TableRowProps<T, K>,
) {
  const key = () => p.item[p.keyField];

  const rowClasses = () => {
    const classes = p.topBorder ? ["group", "border-t"] : ["group"];

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
        // A control in a cell owns its click, and a drag that selects cell
        // text ends in a click too; neither opens the row.
        const target = e.target as HTMLElement;
        if (
          target.closest("button, a, input, label, select, textarea") ||
          (globalThis.getSelection()?.toString() ?? "") !== ""
        ) {
          return;
        }
        p.onRowClick?.(p.item);
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
