import {
  t3,
  type HfaIndicatorCategory,
  type HfaIndicatorSubCategory,
} from "lib";
import {
  Button,
  SortableList,
  openComponent,
  createDeleteAction,
} from "panther";
import { Show, createEffect, createMemo } from "solid-js";
import { createStore, reconcile } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { EditHfaIndicatorCategory } from "./edit_hfa_indicator_category";
import { EditHfaIndicatorSubCategory } from "./edit_hfa_indicator_sub_category";

type Props = {
  categories: HfaIndicatorCategory[];
  subCategories: HfaIndicatorSubCategory[];
  selectedCategoryId: string | null;
  onSelectCategory: (id: string | null) => void;
};

export function HfaCategoriesManager(p: Props) {
  // Selection is owned by the parent so it survives the StateHolderWrapper
  // remount on every SSE refetch. Reconcile it against the current categories.
  createEffect(() => {
    const current = p.selectedCategoryId;
    if (current && !p.categories.some((c) => c.id === current)) {
      p.onSelectCategory(p.categories[0]?.id ?? null);
    } else if (!current && p.categories.length > 0) {
      p.onSelectCategory(p.categories[0].id);
    }
  });

  const selectedCategory = createMemo(() =>
    p.categories.find((c) => c.id === p.selectedCategoryId),
  );

  return (
    <div class="flex h-full">
      <div class="flex w-1/2 flex-none flex-col border-r pr-4">
        <CategoriesPane
          categories={p.categories}
          selectedCategoryId={p.selectedCategoryId}
          onSelect={p.onSelectCategory}
        />
      </div>
      <div class="flex min-w-0 flex-1 flex-col pl-4">
        <Show
          when={selectedCategory()}
          fallback={
            <div class="text-base-content-muted pt-2 text-sm">
              {t3({
                en: "Select a category to manage its sub-categories.",
                fr: "Sélectionnez une catégorie pour gérer ses sous-catégories.",
                pt: "Selecione uma categoria para gerir as suas subcategorias.",
              })}
            </div>
          }
          keyed
        >
          {(cat) => (
            <SubCategoriesPane
              category={cat}
              subCategories={p.subCategories.filter(
                (sc) => sc.categoryId === cat.id,
              )}
              allSubCategoryIds={p.subCategories.map((sc) => sc.id)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

function CategoriesPane(p: {
  categories: HfaIndicatorCategory[];
  selectedCategoryId: string | null;
  onSelect: (id: string) => void;
}) {
  const isAdmin = () => instanceState.currentUserIsGlobalAdmin;
  const [items, setItems] = createStore<HfaIndicatorCategory[]>([
    ...p.categories,
  ]);

  createEffect(() => {
    setItems(reconcile([...p.categories]));
  });

  async function handleReorder(orderedIds: string[]) {
    const reordered: HfaIndicatorCategory[] = [];
    for (const id of orderedIds) {
      const item = items.find((c) => c.id === id);
      if (!item) {
        return;
      }
      reordered.push(item);
    }
    setItems(reconcile(reordered));
    await serverActions.reorderHfaIndicatorCategories({ orderedIds });
  }

  async function handleCreate() {
    await openComponent({
      element: EditHfaIndicatorCategory,
      props: {
        sortOrder: items.length,
        existingIds: items.map((c) => c.id),
      },
    });
  }

  async function handleEdit(category: HfaIndicatorCategory) {
    await openComponent({
      element: EditHfaIndicatorCategory,
      props: {
        existing: category,
        sortOrder: category.sortOrder,
        existingIds: items.map((c) => c.id),
      },
    });
  }

  async function handleDelete(category: HfaIndicatorCategory) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Delete this category? Its sub-categories will also be deleted, and any indicators using it will become uncategorized.",
          fr: "Supprimer cette catégorie ? Ses sous-catégories seront également supprimées, et les indicateurs qui l'utilisent deviendront non catégorisés.",
          pt: "Eliminar esta categoria? As suas subcategorias também serão eliminadas, e os indicadores que a utilizam ficarão sem categoria.",
        }),
        itemList: [`${category.label} (${category.id})`],
      },
      () => serverActions.deleteHfaIndicatorCategory({ id: category.id }),
    );
    await deleteAction.click();
  }

  return (
    <>
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Categories", fr: "Catégories", pt: "Categorias" })} ({items.length})
        </div>
        <Show when={isAdmin()}>
          <Button onClick={handleCreate} iconName="plus" intent="primary">
            {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={items.length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({ en: "No categories", fr: "Aucune catégorie", pt: "Nenhuma categoria" })}
            </div>
          }
        >
          <Show
            when={isAdmin()}
            fallback={
              <div class="ui-spy-sm">
                {items.map((cat) => (
                  <CategoryRow
                    category={cat}
                    selected={cat.id === p.selectedCategoryId}
                    onSelect={() => p.onSelect(cat.id)}
                  />
                ))}
              </div>
            }
          >
            <SortableList items={items} onReorder={handleReorder}>
              {(cat) => (
                <CategoryRow
                  category={cat}
                  selected={cat.id === p.selectedCategoryId}
                  onSelect={() => p.onSelect(cat.id)}
                  onEdit={() => handleEdit(cat)}
                  onDelete={() => handleDelete(cat)}
                />
              )}
            </SortableList>
          </Show>
        </Show>
      </div>
    </>
  );
}

function CategoryRow(p: {
  category: HfaIndicatorCategory;
  selected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      class="flex cursor-pointer items-center gap-2 rounded px-3 py-2"
      classList={{
        "bg-primary-subtle font-700": p.selected,
        "ui-hoverable-base-200": !p.selected,
      }}
      onClick={p.onSelect}
    >
      <div class="min-w-0 flex-1">
        <div class="truncate">{p.category.label}</div>
        <div class="ui-text-caption font-mono">{p.category.id}</div>
      </div>
      <Show when={p.onEdit}>
        <Button
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            p.onEdit!();
          }}
          iconName="pencil"
          intent="base-100"
          size="sm"
        />
      </Show>
      <Show when={p.onDelete}>
        <Button
          onClick={(e: MouseEvent) => {
            e.stopPropagation();
            p.onDelete!();
          }}
          iconName="trash"
          intent="base-100"
          size="sm"
        />
      </Show>
    </div>
  );
}

function SubCategoriesPane(p: {
  category: HfaIndicatorCategory;
  subCategories: HfaIndicatorSubCategory[];
  allSubCategoryIds: string[];
}) {
  const isAdmin = () => instanceState.currentUserIsGlobalAdmin;
  const [items, setItems] = createStore<HfaIndicatorSubCategory[]>([]);

  createEffect(() => {
    const sorted = [...p.subCategories].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    );
    setItems(reconcile(sorted));
  });

  async function handleReorder(orderedIds: string[]) {
    const reordered: HfaIndicatorSubCategory[] = [];
    for (const id of orderedIds) {
      const item = items.find((sc) => sc.id === id);
      if (!item) {
        return;
      }
      reordered.push(item);
    }
    setItems(reconcile(reordered));
    await serverActions.reorderHfaIndicatorSubCategories({
      categoryId: p.category.id,
      orderedIds,
    });
  }

  async function handleCreate() {
    await openComponent({
      element: EditHfaIndicatorSubCategory,
      props: {
        category: p.category,
        sortOrder: items.length,
        existingIds: p.allSubCategoryIds,
      },
    });
  }

  async function handleEdit(subCategory: HfaIndicatorSubCategory) {
    await openComponent({
      element: EditHfaIndicatorSubCategory,
      props: {
        category: p.category,
        existing: subCategory,
        sortOrder: subCategory.sortOrder,
        existingIds: p.allSubCategoryIds,
      },
    });
  }

  async function handleDelete(subCategory: HfaIndicatorSubCategory) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Delete this sub-category? Any indicators using it will have their sub-category cleared.",
          fr: "Supprimer cette sous-catégorie ? Les indicateurs qui l'utilisent verront leur sous-catégorie effacée.",
          pt: "Eliminar esta subcategoria? Os indicadores que a utilizam ficarão sem subcategoria.",
        }),
        itemList: [`${subCategory.label} (${subCategory.id})`],
      },
      () => serverActions.deleteHfaIndicatorSubCategory({ id: subCategory.id }),
    );
    await deleteAction.click();
  }

  return (
    <>
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 min-w-0 flex-1 truncate text-xl">
          {t3({ en: "Sub-categories", fr: "Sous-catégories", pt: "Subcategorias" })} ({items.length})
        </div>
        <Show when={isAdmin()}>
          <Button onClick={handleCreate} iconName="plus" intent="primary">
            {t3({ en: "Add", fr: "Ajouter", pt: "Adicionar" })}
          </Button>
        </Show>
      </div>
      <div class="min-h-0 flex-1 overflow-auto">
        <Show
          when={items.length > 0}
          fallback={
            <div class="text-base-content-muted text-sm">
              {t3({
                en: "No sub-categories in this category",
                fr: "Aucune sous-catégorie dans cette catégorie",
                pt: "Nenhuma subcategoria nesta categoria",
              })}
            </div>
          }
        >
          <Show
            when={isAdmin()}
            fallback={
              <div class="ui-spy-sm">
                {items.map((sc) => (
                  <div class="bg-base-200 flex items-center gap-2 rounded px-3 py-2">
                    <span class="flex-1">{sc.label}</span>
                    <span class="ui-text-caption font-mono">{sc.id}</span>
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
                    <div class="ui-text-caption font-mono">{sc.id}</div>
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
    </>
  );
}
