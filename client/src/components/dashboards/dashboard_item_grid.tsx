import type { PublicDashboardItem } from "lib";
import { t3 } from "lib";
import { SelectionCircle, type SelectionController } from "panther";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import SortableVendor from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import { DashboardItemChart } from "~/components/public_viewer/dashboard";

type Props = {
  items: PublicDashboardItem[];
  selection: SelectionController<string>;
  canConfigure: boolean;
  onReorder: (orderedIds: string[]) => void;
  onContextMenu: (e: MouseEvent, itemId: string) => void;
};

const GRID_CLASS =
  "ui-gap grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] content-start";

export function DashboardItemGrid(p: Props) {
  const byId = () => new Map(p.items.map((i) => [i.id, i]));

  // Local order mirror for optimistic drag-reorder (slide_list pattern).
  const [order, setOrder] = createSignal<{ id: string }[]>(
    p.items.map((i) => ({ id: i.id })),
  );
  createEffect(
    on(
      () => p.items,
      (items) => {
        const cur = order();
        const newIds = items.map((i) => i.id);
        const sameSet =
          cur.length === newIds.length &&
          newIds.every((id) => cur.some((c) => c.id === id));
        const sameOrder =
          cur.length === newIds.length &&
          cur.every((c, i) => c.id === newIds[i]);
        if (!sameSet || !sameOrder) setOrder(newIds.map((id) => ({ id })));
      },
    ),
  );

  const empty = (
    <div class="text-neutral text-sm">
      {t3({
        en: "No items yet. Click 'Add item' to start.",
        fr: "Aucun élément. Cliquez sur « Ajouter un élément ».",
      })}
    </div>
  );

  return (
    <div
      class="ui-pad h-full w-full overflow-auto"
      onClick={() => p.selection.clear()}
    >
      <Show when={p.items.length > 0} fallback={empty}>
        <Show
          when={p.canConfigure}
          fallback={
            <div class={GRID_CLASS}>
              <For each={p.items}>
                {(item) => <ItemCard item={item} p={p} />}
              </For>
            </div>
          }
        >
          <SortableVendor
            idField="id"
            items={order()}
            setItems={(newItems: { id: string }[]) => {
              setOrder(newItems);
              p.onReorder(newItems.map((i) => i.id));
            }}
            class={GRID_CLASS}
            animation={150}
            ghostClass="opacity-50"
            chosenClass="shadow-2xl"
            dragClass="cursor-grabbing"
            fallbackTolerance={3}
          >
            {(o: { id: string }) => (
              <Show when={byId().get(o.id)}>
                {(item) => <ItemCard item={item()} p={p} />}
              </Show>
            )}
          </SortableVendor>
        </Show>
      </Show>
    </div>
  );
}

function ItemCard(props: { item: PublicDashboardItem; p: Props }) {
  const item = () => props.item;
  const id = () => props.item.id;
  const isSelected = () => props.p.selection.isSelected(id());

  return (
    <div
      class="group relative cursor-pointer overflow-clip rounded-md border bg-white p-2 transition-colors"
      classList={{
        "border-base-300 hover:border-primary": !isSelected(),
        "border-primary": isSelected(),
      }}
      onClick={(e) => {
        e.stopPropagation();
        props.p.selection.handleClick(id(), e);
      }}
      onContextMenu={(e) => props.p.onContextMenu(e, id())}
    >
      <Show when={props.p.canConfigure}>
        <SelectionCircle
          isSelected={isSelected()}
          onClick={(e) => props.p.selection.handleClick(id(), e)}
        />
      </Show>
      <div class="aspect-video w-full">
        <DashboardItemChart
          itemId={id()}
          strippedFigureInputs={item().strippedFigureInputs}
          source={item().source}
          geoData={item().geoData}
        />
      </div>
      <div class="mt-1 truncate text-sm font-medium">{item().label}</div>
    </div>
  );
}
