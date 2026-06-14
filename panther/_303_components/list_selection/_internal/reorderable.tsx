// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createEffect, createSignal, type JSX, on, untrack } from "solid-js";
import SortableVendor from "../../form_inputs/solid_sortablejs_vendored.tsx";

// Hardened wrapper over the vendored SortableJS. Holds an optimistic local order
// mirror and resyncs from `items` via a guarded `on(...)` that fires only on a
// real id-set/order change — and NOT while a drag is in progress (the external
// value is buffered and applied on drag end). This is the proven production
// pattern (slide_list / dashboard_item_list), made safe against SSE-mid-drag.
// See PLAN §8 / §12 R1. The engine stays SortableJS (D-engine).

export type ReorderableProps<T extends { id: string }> = {
  items: T[];
  onReorder: (orderedIds: string[]) => void;
  children: (item: T, index: number) => JSX.Element;
  handle?: string;
  class?: string;
};

export function Reorderable<T extends { id: string }>(p: ReorderableProps<T>) {
  const [order, setOrder] = createSignal<T[]>(p.items);
  let dragging = false;
  let pending: T[] | null = null;

  createEffect(
    on(
      () => p.items,
      (items) => {
        if (dragging) {
          pending = items;
          return;
        }
        const cur = untrack(order);
        const sameLen = cur.length === items.length;
        const sameSet = sameLen &&
          items.every((i) => cur.some((c) => c.id === i.id));
        const sameOrder = sameLen &&
          cur.every((c, idx) => c.id === items[idx]?.id);
        if (!sameSet || !sameOrder) setOrder(items);
      },
      { defer: true },
    ),
  );

  function handleSetItems(newItems: T[]) {
    setOrder(newItems);
    p.onReorder(newItems.map((i) => i.id));
  }

  return (
    <SortableVendor
      idField="id"
      items={order()}
      setItems={handleSetItems}
      animation={150}
      ghostClass="opacity-50"
      chosenClass="shadow-2xl"
      dragClass="cursor-grabbing"
      fallbackTolerance={3}
      handle={p.handle}
      class={p.class}
      onStart={() => {
        dragging = true;
      }}
      onEnd={() => {
        dragging = false;
        if (pending) {
          const next = pending;
          pending = null;
          queueMicrotask(() => setOrder(next));
        }
      }}
    >
      {(item: T) =>
        p.children(item, untrack(order).findIndex((i) => i.id === item.id))}
    </SortableVendor>
  );
}
