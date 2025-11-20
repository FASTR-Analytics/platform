// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { type Accessor, JSX } from "solid-js";
import type {
  StateHolderButtonAction,
  StateHolderFormAction,
} from "../../special_state/mod.ts";

export type TableColumn<T> = {
  key: string;
  header: string;
  sortable?: boolean;
  render?: (item: T) => JSX.Element;
  width?: string;
  align?: "left" | "center" | "right";
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

export type BulkActionResult = void | boolean | "CLEAR_SELECTION";

export type BulkAction<T> = {
  label: string;
  intent?: "primary" | "danger" | "neutral" | "success";
  outline?: boolean;
  onClick: (items: T[]) => BulkActionResult | Promise<BulkActionResult>;
  state?: Accessor<StateHolderButtonAction | StateHolderFormAction>;
};

export type TablePadding = "compact" | "normal" | "comfortable";

export type TableProps<T> = {
  data: T[];
  columns: TableColumn<T>[];
  keyField: keyof T;
  onRowClick?: (item: T) => void;
  groups?: TableGroup<T>[];
  currentGroup?: string;
  noRowsMessage?: string;
  bulkActions?: BulkAction<T>[];
  selectionLabel?: string; // e.g. "user", "row", "item"
  tableContentMaxHeight?: string; // e.g. "400px", "50vh" - limits tbody height and makes it scrollable
  fitTableToAvailableHeight?: boolean; // enables overflow-y: auto for scrollable table
  defaultSort?: SortConfig; // initial sort configuration
  selectedKeys?: Accessor<Set<any>>; // controlled selection state
  setSelectedKeys?: (keys: Set<any>) => void; // controlled selection setter
  paddingX?: TablePadding; // horizontal padding (default: "normal")
  paddingY?: TablePadding; // vertical padding (default: "normal")
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
