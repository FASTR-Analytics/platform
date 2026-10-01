// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { Accessor, JSX } from "solid-js";
import type { PluralForms } from "../../deps.ts";
import type { PadSize } from "../../types.ts";
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
  // Every column is searched unless it opts out: were it opt-in, a searched
  // table with no column marked would empty on the first keystroke.
  searchable?: boolean;
  // The column's search text; without it, filterValue, then the field.
  searchValue?: (item: T) => string;
  render?: (item: T) => JSX.Element;
  width?: string;
  alignH?: "left" | "center" | "right";
  // For a column of controls taller than a line of text: the cell counts as
  // one line and its content overflows that, centred, so the row is as tall as
  // its text. Content that wraps, or is taller than the row, overlaps the
  // neighbouring rows.
  pullInY?: boolean;
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
    // What a row is, for the count and the selection sentence: "user" /
    // "users". Default "item" / "items".
    itemLabel?: PluralForms<string>;
    // A row above the rows: the search field, then the count, or the
    // selection sentence and the bulk actions while anything is selected, and
    // children on the right, always. Also present, without being asked for,
    // whenever there are bulk actions.
    // It floats above the frame by default, unpadded, `spy` away from it;
    // `nested` puts it inside the frame, inset like the cells and padded
    // vertically by `pad`. `spy` defaults to "sm", `pad` to "md".
    toolbar?:
      & {
        search?: boolean | { placeholder?: string };
        count?: boolean;
        children?: JSX.Element;
      }
      & (
        | { nested?: false; spy?: PadSize }
        | { nested: true; pad?: PadSize }
      );
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
    // The row's whole search text; when given, the columns are not consulted.
    searchValue?: (item: T) => string;
    paddingX?: TablePadding;
    paddingY?: TablePadding;
    // Restore the scroll container to this offset on mount, and report it as it
    // changes; hoist it to survive remounts.
    initialScrollTop?: number;
    onScrollTopChange?: (scrollTop: number) => void;
  }
  & TableHeaderForm<T, K>
  & TableSearchForm;

// Controlled search text; both or neither.
type TableSearchForm =
  | { searchText: string; setSearchText: (v: string) => void }
  | { searchText?: undefined; setSearchText?: undefined };

// Selection needs the header, where its select-all checkbox lives, so the type
// admits a hidden header only on a table without selection. Sort and filter
// controls live there too: a headerless table is a static list.
type TableHeaderForm<T, K extends keyof T> =
  | {
    hideHeader?: false;
    bulkActions?: BulkAction<T>[];
    // Controlled selection; both or neither.
    selectedKeys?: Accessor<Set<T[K]>>;
    setSelectedKeys?: (keys: Set<T[K]>) => void;
  }
  | {
    hideHeader: true;
    bulkActions?: undefined;
    selectedKeys?: undefined;
    setSelectedKeys?: undefined;
  };
