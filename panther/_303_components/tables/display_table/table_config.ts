// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createStore, type Store } from "solid-js/store";
import type { SortConfig } from "./types.ts";

export type TableConfigState = {
  sort: SortConfig | null;
  // Column key -> the values the user has unchecked. A missing key or an
  // empty list means the column is unfiltered, so values that first appear in
  // the data later are visible by default.
  filters: Record<string, string[]>;
  searchText: string;
  scrollTop: number;
};

export type TableConfig = {
  state: Store<TableConfigState>;
  setSort: (sort: SortConfig | null) => void;
  setFilter: (columnKey: string, excluded: string[]) => void;
  setSearchText: (text: string) => void;
  setScrollTop: (scrollTop: number) => void;
  clearFilters: () => void;
};

// Every write replaces a whole top-level field. The path form,
// setState("sort", next), merges an object into the existing one, so the field
// keeps its identity and a reader of the whole field never re-runs.
export function createTableConfig(
  init?: Partial<TableConfigState>,
): TableConfig {
  const [state, setState] = createStore<TableConfigState>({
    sort: init?.sort ?? null,
    filters: init?.filters ?? {},
    searchText: init?.searchText ?? "",
    scrollTop: init?.scrollTop ?? 0,
  });
  return {
    state,
    setSort: (sort) => setState({ sort }),
    // The function form reads the raw state: reading state.filters here would
    // subscribe a calling effect to its own write.
    setFilter: (columnKey, excluded) =>
      setState((s) => ({
        filters: { ...s.filters, [columnKey]: excluded },
      })),
    setSearchText: (searchText) => setState({ searchText }),
    setScrollTop: (scrollTop) => setState({ scrollTop }),
    clearFilters: () => setState({ filters: {} }),
  };
}
