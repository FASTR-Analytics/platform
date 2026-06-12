import { t3, type HfaIndicatorServiceCategory } from "lib";
import {
  Button,
  SortableList,
  openComponent,
  createDeleteAction,
} from "panther";
import { Show, createEffect } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { EditHfaIndicatorServiceCategory } from "./edit_hfa_indicator_service_category";

type Props = {
  serviceCategories: HfaIndicatorServiceCategory[];
};

export function HfaServiceCategoriesManager(p: Props) {
  const isAdmin = instanceState.currentUserIsGlobalAdmin;
  const [items, setItems] = createStore<HfaIndicatorServiceCategory[]>([
    ...p.serviceCategories,
  ]);

  createEffect(() => {
    setItems(reconcile([...p.serviceCategories]));
  });

  async function handleReorder(orderedIds: string[]) {
    const reordered = orderedIds.map((id) => items.find((c) => c.id === id)!);
    setItems(reconcile(reordered));
    await serverActions.reorderHfaIndicatorServiceCategories({ orderedIds });
  }

  async function handleCreate() {
    await openComponent({
      element: EditHfaIndicatorServiceCategory,
      props: {
        sortOrder: items.length,
        existingIds: items.map((c) => c.id),
      },
    });
  }

  async function handleEdit(serviceCategory: HfaIndicatorServiceCategory) {
    await openComponent({
      element: EditHfaIndicatorServiceCategory,
      props: {
        existing: serviceCategory,
        sortOrder: serviceCategory.sortOrder,
        existingIds: items.map((c) => c.id),
      },
    });
  }

  async function handleDelete(serviceCategory: HfaIndicatorServiceCategory) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Delete this service category? Any indicators using it will have their service category cleared.",
          fr: "Supprimer cette catégorie de service ? Les indicateurs qui l'utilisent verront leur catégorie de service effacée.",
        }),
        itemList: [`${serviceCategory.label} (${serviceCategory.id})`],
      },
      () =>
        serverActions.deleteHfaIndicatorServiceCategory({
          id: serviceCategory.id,
        }),
    );
    await deleteAction.click();
  }

  return (
    <div class="flex h-full w-1/2 flex-col">
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Service categories", fr: "Catégories de service" })} (
          {items.length})
        </div>
        <Show when={isAdmin}>
          <Button onClick={handleCreate} iconName="plus" intent="primary">
            {t3({ en: "Add", fr: "Ajouter" })}
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={items.length > 0}
          fallback={
            <div class="text-neutral text-sm">
              {t3({
                en: "No service categories",
                fr: "Aucune catégorie de service",
              })}
            </div>
          }
        >
          <Show
            when={isAdmin}
            fallback={
              <div class="ui-spy-sm">
                {items.map((sc) => (
                  <div class="bg-base-200 flex items-center gap-2 rounded px-3 py-2">
                    <span class="flex-1">{sc.label}</span>
                    <span class="text-neutral font-mono text-xs">{sc.id}</span>
                  </div>
                ))}
              </div>
            }
          >
            <SortableList items={items} onReorder={handleReorder}>
              {(sc) => (
                <div class="bg-base-200 flex items-center gap-2 rounded px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <div class="truncate">{sc.label}</div>
                    <div class="text-neutral font-mono text-xs">{sc.id}</div>
                  </div>
                  <Button
                    onClick={() => handleEdit(sc)}
                    iconName="pencil"
                    intent="base-100"
                    size="sm"
                  />
                  <Button
                    onClick={() => handleDelete(sc)}
                    iconName="trash"
                    intent="base-100"
                    size="sm"
                  />
                </div>
              )}
            </SortableList>
          </Show>
        </Show>
      </div>
    </div>
  );
}
