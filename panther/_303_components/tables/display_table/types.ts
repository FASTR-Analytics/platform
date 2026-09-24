// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Accessor, JSX } from "solid-js";
import type {
  StateHolderButtonAction,
  StateHolderFormAction,
} from "../../special_state/mod.ts";

// deno-lint-ignore no-explicit-any -- row objects are structurally open; `unknown` would reject consumer row types lacking an index signature
export type AnyRow = Record<string, any>;

export type TableColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  sortValue?: (item: T) => unknown;
  filterable?: boolean;
  filterValue?: (item: T) => string;
  render?: (item: T) => JSX.Element;
  width?: string;
  alignH?: "left" | "center" | "right";
};

export type SortConfig = {
  key: string;
  direction: "asc" | "desc";
};

// Column key -> the filter values the user has unchecked. An empty set (or a
// missing key) means the column is unfiltered, so values that first appear in
// the data later are visible by default.
export type FilterConfig = ReadonlyMap<string, ReadonlySet<string>>;

export type BulkActionResult = void | boolean | "CLEAR_SELECTION";

export type BulkAction<T> = {
  label: string;
  intent?: "primary" | "danger" | "neutral" | "success";
  outline?: boolean;
  onClick: (items: T[]) => BulkActionResult | Promise<BulkActionResult>;
  state?: Accessor<StateHolderButtonAction | StateHolderFormAction>;
};

export type TablePadding = "compact" | "normal" | "comfortable";

export type TableProps<T, K extends keyof T = keyof T> =
  & {
    data: T[];
    columns: TableColumn<T>[];
    keyField: K;
    onRowClick?: (item: T) => void;
    noRowsMessage?: string;
    // Caps the scroll box (e.g. "500px", "60vh") in place of the parent's
    // height, for a parent that gives none.
    maxHeight?: string;
    defaultSort?: SortConfig;
    onSortChange?: (config: SortConfig | null) => void;
    // Initial per-column excluded values, and the callback to persist them.
    defaultFilters?: FilterConfig;
    onFilterChange?: (filters: FilterConfig) => void;
    paddingX?: TablePadding;
    paddingY?: TablePadding;
    // Restore the scroll container to this offset on mount, and report it as it
    // changes; hoist it to survive remounts.
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
  }
  & TableHeaderForm<T, K>;

// Selection needs the header, where its select-all checkbox lives, so the type
// admits a hidden header only on a table without selection. Sort and filter
// controls live there too: a headerless table is a static list.
type TableHeaderForm<T, K extends keyof T> =
  | {
    hideHeader?: false;
    bulkActions?: BulkAction<T>[];
    selectionLabel?: string; // e.g. "user", "row", "item"
    // Controlled selection; both or neither.
    selectedKeys?: Accessor<Set<T[K]>>;
    setSelectedKeys?: (keys: Set<T[K]>) => void;
  }
  | {
    hideHeader: true;
    bulkActions?: undefined;
    selectionLabel?: undefined;
    selectedKeys?: undefined;
    setSelectedKeys?: undefined;
  };
