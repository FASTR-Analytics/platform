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

export type TableGroup<T> = {
  key: string;
  label: (items: T[]) => string;
  groupBy: (item: T) => string;
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

export type TableProps<T, K extends keyof T = keyof T> = {
  data: T[];
  columns: TableColumn<T>[];
  keyField: K;
  onRowClick?: (item: T) => void;
  groups?: TableGroup<T>[];
  currentGroup?: string;
  noRowsMessage?: string;
  bulkActions?: BulkAction<T>[];
  selectionLabel?: string; // e.g. "user", "row", "item"
  tableContentMaxHeight?: string; // e.g. "400px", "50vh" - limits tbody height and makes it scrollable
  fitTableToAvailableHeight?: boolean; // enables overflow-y: auto for scrollable table
  defaultSort?: SortConfig; // initial sort configuration
  onSortChange?: (config: SortConfig | null) => void; // callback when sort changes
  defaultFilters?: FilterConfig; // initial per-column excluded values
  onFilterChange?: (filters: FilterConfig) => void; // callback when a column filter changes
  selectedKeys?: Accessor<Set<T[K]>>; // controlled selection state
  setSelectedKeys?: (keys: Set<T[K]>) => void; // controlled selection setter
  paddingX?: TablePadding; // horizontal padding (default: "normal")
  paddingY?: TablePadding; // vertical padding (default: "normal")
  initialScrollTop?: number; // restore the scroll container to this offset on mount
  onScrollTopChange?: (scrollTop: number) => void; // reports scroll offset; hoist it to survive remounts
};

export type ProcessedData<T> = {
  isGrouped: boolean;
  groups: Array<{
    key: string;
    label: string;
    items: T[];
  }>;
  allItems: T[];
};
