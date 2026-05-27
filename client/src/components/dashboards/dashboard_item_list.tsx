import { DashboardItem, t3 } from "lib";
import { Button, Input } from "panther";
import SortableVendor from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import { For, Show, createEffect, createSignal, on } from "solid-js";

type Props = {
  items: DashboardItem[];
  selectedItemId: string | undefined;
  setSelectedItemId: (id: string) => void;
  canConfigure: boolean;
  onReorder: (oldIds: string[], newIds: string[]) => Promise<void>;
  onUpdateLabel: (itemId: string, label: string) => Promise<void>;
  onDelete: (item: DashboardItem) => Promise<void>;
};

export function DashboardItemList(p: Props) {
  // Local optimistic copy of item order for drag-and-drop
  const [sortableItems, setSortableItems] = createSignal<{ id: string }[]>(
    p.items.map((i) => ({ id: i.id })),
  );

  // Sync when items change externally (SSE, refresh)
  createEffect(
    on(
      () => p.items,
      (items) => {
        const ids = items.map((i) => i.id);
        const current = sortableItems();
        const setChanged =
          current.length !== ids.length ||
          !ids.every((id) => current.some((c) => c.id === id));
        const orderChanged = !current.every((c, i) => c.id === ids[i]);
        if (setChanged || orderChanged) {
          setSortableItems(ids.map((id) => ({ id })));
        }
      },
    ),
  );

  const itemById = () => {
    const map = new Map<string, DashboardItem>();
    for (const item of p.items) map.set(item.id, item);
    return map;
  };

  return (
    <Show
      when={p.items.length > 0}
      fallback={
        <div class="text-neutral text-sm p-2">
          {t3({
            en: "No items yet. Click 'Add item' to start.",
            fr: "Aucun élément. Cliquez sur « Ajouter un élément ».",
          })}
        </div>
      }
    >
      <SortableVendor
        idField="id"
        items={sortableItems()}
        setItems={(newItems: { id: string }[]) => {
          const oldItems = sortableItems();
          setSortableItems(newItems);
          p.onReorder(
            oldItems.map((i) => i.id),
            newItems.map((i) => i.id),
          );
        }}
        class="ui-spy-sm flex flex-col"
        animation={150}
        ghostClass="opacity-50"
        chosenClass="shadow-lg"
        dragClass="cursor-grabbing"
        disabled={!p.canConfigure}
      >
        {(sortItem: { id: string }) => {
          const item = itemById().get(sortItem.id);
          return (
            <Show when={item} keyed>
              {(fullItem) => (
                <DashboardItemRow
                  item={fullItem}
                  isSelected={p.selectedItemId === fullItem.id}
                  canConfigure={p.canConfigure}
                  onSelect={() => p.setSelectedItemId(fullItem.id)}
                  onUpdateLabel={(label) =>
                    p.onUpdateLabel(fullItem.id, label)
                  }
                  onDelete={() => p.onDelete(fullItem)}
                />
              )}
            </Show>
          );
        }}
      </SortableVendor>
    </Show>
  );
}

type RowProps = {
  item: DashboardItem;
  isSelected: boolean;
  canConfigure: boolean;
  onSelect: () => void;
  onUpdateLabel: (label: string) => Promise<void>;
  onDelete: () => Promise<void>;
};

function DashboardItemRow(p: RowProps) {
  const [editing, setEditing] = createSignal(false);
  const [draftLabel, setDraftLabel] = createSignal(p.item.label);

  function startEdit(e: MouseEvent) {
    e.stopPropagation();
    setDraftLabel(p.item.label);
    setEditing(true);
  }

  async function commitEdit() {
    const next = draftLabel().trim();
    if (next && next !== p.item.label) {
      await p.onUpdateLabel(next);
    }
    setEditing(false);
  }

  function cancelEdit() {
    setDraftLabel(p.item.label);
    setEditing(false);
  }

  return (
    <div
      class="border-base-300 rounded border p-2"
      classList={{
        "bg-primary text-base-100": p.isSelected,
        "hover:bg-base-200 cursor-pointer": !p.isSelected,
        "cursor-grab": p.canConfigure,
      }}
      onClick={p.onSelect}
    >
      <Show
        when={editing()}
        fallback={
          <div class="truncate text-sm font-semibold">{p.item.label}</div>
        }
      >
        <div onClick={(e) => e.stopPropagation()} class="ui-spy-sm">
          <Input
            value={draftLabel()}
            onChange={setDraftLabel}
            fullWidth
            autoFocus
          />
          <div class="ui-gap-sm flex">
            <Button size="sm" iconName="check" onClick={commitEdit}>
              {t3({ en: "Save", fr: "Sauvegarder" })}
            </Button>
            <Button size="sm" outline iconName="x" onClick={cancelEdit}>
              {t3({ en: "Cancel", fr: "Annuler" })}
            </Button>
          </div>
        </div>
      </Show>
      <Show when={p.canConfigure && !editing()}>
        <div class="ui-gap-sm mt-2 flex">
          <Button
            size="sm"
            outline
            iconName="pencil"
            onClick={startEdit}
          />
          <Button
            size="sm"
            outline
            intent="danger"
            iconName="trash"
            onClick={(e: MouseEvent) => {
              e.stopPropagation();
              p.onDelete();
            }}
          />
        </div>
      </Show>
    </div>
  );
}
