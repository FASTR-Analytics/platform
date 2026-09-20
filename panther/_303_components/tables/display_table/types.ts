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

export type TableProps<T, K extends keyof T = keyof T> = {
  data: T[];
  columns: TableColumn<T>[];
  keyField: K;
  onRowClick?: (item: T) => void;
  noRowsMessage?: string;
  bulkActions?: BulkAction<T>[];
  selectionLabel?: string; // e.g. "user", "row", "item"
  // Limits the body height (e.g. "400px", "50vh") and makes it scroll.
  tableContentMaxHeight?: string;
  // Fills the parent's height and scrolls the body inside it.
  fitTableToAvailableHeight?: boolean;
  defaultSort?: SortConfig;
  onSortChange?: (config: SortConfig | null) => void;
  // Initial per-column excluded values, and the callback to persist them.
  defaultFilters?: FilterConfig;
  onFilterChange?: (filters: FilterConfig) => void;
  // Controlled selection; both or neither.
  selectedKeys?: Accessor<Set<T[K]>>;
  setSelectedKeys?: (keys: Set<T[K]>) => void;
  paddingX?: TablePadding;
  paddingY?: TablePadding;
  // Restore the scroll container to this offset on mount, and report it as it
  // changes; hoist it to survive remounts.
  initialScrollTop?: number;
  onScrollTopChange?: (scrollTop: number) => void;
};
