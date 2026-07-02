import type { PublicDashboardItem } from "lib";
import { t3 } from "lib";
import { SelectionCircle, type SelectionController } from "panther";
import { createEffect, createSignal, For, on, Show } from "solid-js";
import SortableVendor from "../../../../panther/_303_components/form_inputs/solid_sortablejs_vendored.tsx";
import { FigureThumbnail } from "~/components/PresentationObjectMiniDisplay";
import { buildFigureInputs } from "~/generate_visualization/mod";

// One entry in the editor grid: a standalone item or a replicant group (shown as
// a single "card-set" card). `id` is the selection/reorder key (item id or group
// id); `thumbnail` is what the card renders (default member for a group).
export type DashboardGridEntry = {
  id: string;
  kind: "item" | "group";
  label: string;
  thumbnail: PublicDashboardItem;
  count: number;
};

type Props = {
  entries: DashboardGridEntry[];
  selection: SelectionController<string>;
  canConfigure: boolean;
  onReorder: (orderedIds: string[]) => void;
  onContextMenu: (e: MouseEvent, entryId: string) => void;
};

// Match the visualization panel grid (PresentationObjectPanelDisplay), plus a
// row-subgrid pass-through on the direct children. The drag-sort vendor wraps
// each card in a plain <div>, so the card is no longer a direct grid item and
// its own grid-rows-subgrid has no tracks to borrow — leaving cards unaligned.
// Re-establishing subgrid on the wrapper forwards the shared row tracks to the
// card, so labels/charts line up across each row. Harmless on the no-wrapper
// fallback path (the card already carries these classes).
const GRID_CLASS =
  "ui-pad ui-gap grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] content-start items-start [&>*]:row-span-2 [&>*]:grid [&>*]:grid-rows-subgrid";

export function DashboardItemGrid(p: Props) {
  const byId = () => new Map(p.entries.map((e) => [e.id, e]));

  // Local order mirror for optimistic drag-reorder.
  const [order, setOrder] = createSignal<{ id: string }[]>(
    p.entries.map((e) => ({ id: e.id })),
  );
  createEffect(
    on(
      () => p.entries,
      (entries) => {
        const cur = order();
        const newIds = entries.map((e) => e.id);
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
    <div class="ui-pad text-neutral text-sm">
      {t3({
        en: "No items yet. Click 'Add item' to start.",
        fr: "Aucun élément. Cliquez sur « Ajouter un élément ».",
        pt: "Ainda não há elementos. Clique em 'Adicionar elemento' para começar.",
      })}
    </div>
  );

  return (
    <div
      class="h-full w-full overflow-auto"
      onClick={() => p.selection.clear()}
    >
      <Show when={p.entries.length > 0} fallback={empty}>
        <Show
          when={p.canConfigure}
          fallback={
            <div class={GRID_CLASS}>
              <For each={p.entries}>
                {(entry) => <EntryCard entry={entry} p={p} />}
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
                {(entry) => <EntryCard entry={entry()} p={p} />}
              </Show>
            )}
          </SortableVendor>
        </Show>
      </Show>
    </div>
  );
}

function EntryCard(props: { entry: DashboardGridEntry; p: Props }) {
  const entry = () => props.entry;
  const id = () => props.entry.id;
  const isGroup = () => props.entry.kind === "group";
  const isSelected = () => props.p.selection.isSelected(id());
  const figureInputs = () => {
    try {
      return buildFigureInputs(entry().thumbnail.bundle);
    } catch {
      return undefined;
    }
  };

  return (
    <div class="group row-span-2 grid grid-rows-subgrid gap-y-1 ring-offset-[6px]">
      <div class="ui-gap-sm flex items-end pb-1">
        <div class="font-400 text-base-content pointer-events-none text-xs italic select-none">
          {entry().label}
        </div>
      </div>
      <div class="relative">
        {/* Card-set: stacked layers behind a group card to signal "many". */}
        <Show when={isGroup()}>
          <div class="border-base-300 bg-base-100 absolute -top-1 right-1 left-1 h-full rounded border" />
          <div class="border-base-300 bg-base-100 absolute -top-0.5 right-0.5 left-0.5 h-full rounded border" />
        </Show>
        <div
          class="bg-base-100 relative cursor-pointer rounded border p-2"
          classList={{
            "border-base-300": !isSelected(),
            "border-primary": isSelected(),
            "hover:border-primary": !isSelected(),
          }}
          onClick={(e) => {
            e.stopPropagation();
            props.p.selection.handleClick(id(), e);
          }}
          onContextMenu={(e) => props.p.onContextMenu(e, id())}
        >
          <SelectionCircle
            isSelected={isSelected()}
            onClick={(e) => props.p.selection.handleClick(id(), e)}
          />
          <Show when={isGroup()}>
            <div class="bg-primary text-primary-content absolute top-2 left-2 z-10 rounded px-1 py-0.5 text-xs font-medium">
              {entry().count}{" "}
              {t3({ en: "replicants", fr: "réplicants", pt: "replicantes" })}
            </div>
          </Show>
          <Show when={figureInputs()}>
            {(fi) => <FigureThumbnail figureInputs={fi()} />}
          </Show>
        </div>
      </div>
    </div>
  );
}
