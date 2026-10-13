import { createSignal, For, type JSX } from "solid-js";

// A vertical list the user reorders by dragging a row by its handle. Rows
// are keyed by id; `onReorder` gets the ids in their new order when a row is
// dropped, and the caller re-renders from its own state. Native drag and
// drop, so there is nothing to install.
export function SortableList<T extends { id: string }>(p: {
  items: T[];
  onReorder: (ids: string[]) => void;
  children: (item: T) => JSX.Element;
}): JSX.Element {
  const [dragging, setDragging] = createSignal<string>();
  // Where the dragged row would land: before the row with this id, or at the
  // end of the list.
  const [target, setTarget] = createSignal<string | "end">();

  function drop() {
    const from = dragging();
    const to = target();
    setDragging(undefined);
    setTarget(undefined);
    if (from === undefined || to === undefined || from === to) return;
    const ids = p.items.map((it) => it.id).filter((id) => id !== from);
    const at = to === "end" ? ids.length : ids.indexOf(to);
    if (at < 0) return;
    ids.splice(at, 0, from);
    if (ids.join("\n") !== p.items.map((it) => it.id).join("\n")) {
      p.onReorder(ids);
    }
  }

  return (
    <div
      onDragOver={(e) => {
        if (dragging() === undefined) return;
        e.preventDefault();
      }}
      onDrop={(e) => {
        e.preventDefault();
        drop();
      }}
    >
      <For each={p.items}>
        {(item, i) => (
          <div
            class="rf-sortable__row"
            classList={{
              "rf-sortable__ghost": dragging() === item.id,
              "rf-sortable__row--target": target() === item.id &&
                dragging() !== item.id,
            }}
            onDragOver={(e) => {
              if (dragging() === undefined) return;
              e.preventDefault();
              // The upper half of a row means "before it"; the lower half
              // means before the next one.
              const r = e.currentTarget.getBoundingClientRect();
              const upper = e.clientY < r.top + r.height / 2;
              const next = p.items[i() + 1]?.id ?? "end";
              setTarget(upper ? item.id : next);
            }}
          >
            <span
              class="rf-sortable__handle"
              draggable={true}
              aria-hidden="true"
              onDragStart={(e) => {
                setDragging(item.id);
                e.dataTransfer?.setData("text/plain", item.id);
                if (e.dataTransfer) e.dataTransfer.effectAllowed = "move";
              }}
              onDragEnd={() => {
                setDragging(undefined);
                setTarget(undefined);
              }}
            >
              ⠿
            </span>
            {p.children(item)}
          </div>
        )}
      </For>
    </div>
  );
}
