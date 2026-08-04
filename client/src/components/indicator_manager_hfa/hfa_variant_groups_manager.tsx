import {
  t3,
  type HfaIndicator,
  type HfaIndicatorVariantGroup,
  type HfaIndicatorVariantItem,
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
import { EditHfaIndicatorVariantGroup } from "./edit_hfa_indicator_variant_group";
import { EditHfaIndicatorVariantItem } from "./edit_hfa_indicator_variant_item";

type Props = {
  variantGroups: HfaIndicatorVariantGroup[];
  variantItems: HfaIndicatorVariantItem[];
  indicators: HfaIndicator[];
  selectedGroupId: string | null;
  onSelectGroup: (id: string | null) => void;
};

export function HfaVariantGroupsManager(p: Props) {
  // Selection is owned by the parent so it survives the StateHolderWrapper
  // remount on every SSE refetch. Reconcile it against the current groups.
  createEffect(() => {
    const current = p.selectedGroupId;
    if (current && !p.variantGroups.some((g) => g.id === current)) {
      p.onSelectGroup(p.variantGroups[0]?.id ?? null);
    } else if (!current && p.variantGroups.length > 0) {
      p.onSelectGroup(p.variantGroups[0].id);
    }
  });

  const selectedGroup = createMemo(() =>
    p.variantGroups.find((g) => g.id === p.selectedGroupId),
  );

  return (
    <div class="flex h-full">
      <div class="flex w-1/2 flex-none flex-col border-r pr-4">
        <GroupsPane
          variantGroups={p.variantGroups}
          indicators={p.indicators}
          selectedGroupId={p.selectedGroupId}
          onSelect={p.onSelectGroup}
        />
      </div>
      <div class="flex min-w-0 flex-1 flex-col pl-4">
        <Show
          when={selectedGroup()}
          fallback={
            <div class="text-base-content-muted pt-2 text-sm">
              {t3({
                en: "Select a variant group to manage its items.",
                fr: "Sélectionnez un groupe de variantes pour gérer ses éléments.",
                pt: "Selecione um grupo de variantes para gerir os seus itens.",
              })}
            </div>
          }
          keyed
        >
          {(group) => (
            <ItemsPane
              group={group}
              items={p.variantItems.filter((it) => it.groupId === group.id)}
            />
          )}
        </Show>
      </div>
    </div>
  );
}

function GroupsPane(p: {
  variantGroups: HfaIndicatorVariantGroup[];
  indicators: HfaIndicator[];
  selectedGroupId: string | null;
  onSelect: (id: string) => void;
}) {
  const isAdmin = () => instanceState.currentUserIsGlobalAdmin;
  const [items, setItems] = createStore<HfaIndicatorVariantGroup[]>([
    ...p.variantGroups,
  ]);

  createEffect(() => {
    setItems(reconcile([...p.variantGroups]));
  });

  const indicatorCountByGroup = createMemo(() => {
    const map = new Map<string, number>();
    for (const ind of p.indicators) {
      if (ind.variantGroupId) {
        map.set(ind.variantGroupId, (map.get(ind.variantGroupId) ?? 0) + 1);
      }
    }
    return map;
  });

  async function handleReorder(orderedIds: string[]) {
    const reordered: HfaIndicatorVariantGroup[] = [];
    for (const id of orderedIds) {
      const item = items.find((g) => g.id === id);
      if (!item) {
        return;
      }
      reordered.push(item);
    }
    setItems(reconcile(reordered));
    await serverActions.reorderHfaIndicatorVariantGroups({ orderedIds });
  }

  async function handleCreate() {
    await openComponent({
      element: EditHfaIndicatorVariantGroup,
      props: {
        sortOrder: items.length,
        existingIds: items.map((g) => g.id),
      },
    });
  }

  async function handleEdit(group: HfaIndicatorVariantGroup) {
    await openComponent({
      element: EditHfaIndicatorVariantGroup,
      props: {
        existing: group,
        sortOrder: group.sortOrder,
        existingIds: items.map((g) => g.id),
      },
    });
  }

  async function handleDelete(group: HfaIndicatorVariantGroup) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Delete this variant group? Its items and their code will also be deleted. Deletion is refused while any indicator is still assigned to the group.",
          fr: "Supprimer ce groupe de variantes ? Ses éléments et leur code seront également supprimés. La suppression est refusée tant qu'un indicateur est encore assigné au groupe.",
          pt: "Eliminar este grupo de variantes? Os seus itens e o respetivo código também serão eliminados. A eliminação é recusada enquanto algum indicador ainda estiver atribuído ao grupo.",
        }),
        itemList: [`${group.label} (${group.id})`],
      },
      () => serverActions.deleteHfaIndicatorVariantGroup({ id: group.id }),
    );
    await deleteAction.click();
  }

  return (
    <>
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 flex-1 text-xl">
          {t3({ en: "Variant groups", fr: "Groupes de variantes", pt: "Grupos de variantes" })} ({items.length})
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
                en: "No variant groups. A variant group defines the response options (items) an indicator can be broken down by — assign a group to an indicator in its code editor.",
                fr: "Aucun groupe de variantes. Un groupe de variantes définit les options de réponse (éléments) selon lesquelles un indicateur peut être ventilé — assignez un groupe à un indicateur dans son éditeur de code.",
                pt: "Nenhum grupo de variantes. Um grupo de variantes define as opções de resposta (itens) pelas quais um indicador pode ser desagregado — atribua um grupo a um indicador no seu editor de código.",
              })}
            </div>
          }
        >
          <Show
            when={isAdmin()}
            fallback={
              <div class="ui-spy-sm">
                {items.map((group) => (
                  <GroupRow
                    group={group}
                    indicatorCount={indicatorCountByGroup().get(group.id) ?? 0}
                    selected={group.id === p.selectedGroupId}
                    onSelect={() => p.onSelect(group.id)}
                  />
                ))}
              </div>
            }
          >
            <SortableList items={items} onReorder={handleReorder}>
              {(group) => (
                <GroupRow
                  group={group}
                  indicatorCount={indicatorCountByGroup().get(group.id) ?? 0}
                  selected={group.id === p.selectedGroupId}
                  onSelect={() => p.onSelect(group.id)}
                  onEdit={() => handleEdit(group)}
                  onDelete={() => handleDelete(group)}
                />
              )}
            </SortableList>
          </Show>
        </Show>
      </div>
    </>
  );
}

function GroupRow(p: {
  group: HfaIndicatorVariantGroup;
  indicatorCount: number;
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
        <div class="truncate">{p.group.label}</div>
        <div class="ui-text-caption font-mono">{p.group.id}</div>
      </div>
      <Show when={p.indicatorCount > 0}>
        <div class="ui-text-caption flex-none">
          {t3({
            en: `${p.indicatorCount} indicator(s)`,
            fr: `${p.indicatorCount} indicateur(s)`,
            pt: `${p.indicatorCount} indicador(es)`,
          })}
        </div>
      </Show>
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

function ItemsPane(p: {
  group: HfaIndicatorVariantGroup;
  items: HfaIndicatorVariantItem[];
}) {
  const isAdmin = () => instanceState.currentUserIsGlobalAdmin;
  const [items, setItems] = createStore<HfaIndicatorVariantItem[]>([]);

  createEffect(() => {
    const sorted = [...p.items].sort((a, b) => a.sortOrder - b.sortOrder);
    setItems(reconcile(sorted));
  });

  async function handleReorder(orderedIds: string[]) {
    const reordered: HfaIndicatorVariantItem[] = [];
    for (const id of orderedIds) {
      const item = items.find((it) => it.id === id);
      if (!item) {
        return;
      }
      reordered.push(item);
    }
    setItems(reconcile(reordered));
    await serverActions.reorderHfaIndicatorVariantItems({
      groupId: p.group.id,
      orderedIds,
    });
  }

  async function handleCreate() {
    await openComponent({
      element: EditHfaIndicatorVariantItem,
      props: {
        group: p.group,
        sortOrder: items.length,
        existingIds: items.map((it) => it.id),
      },
    });
  }

  async function handleEdit(item: HfaIndicatorVariantItem) {
    await openComponent({
      element: EditHfaIndicatorVariantItem,
      props: {
        group: p.group,
        existing: item,
        sortOrder: item.sortOrder,
        existingIds: items.map((it) => it.id),
      },
    });
  }

  async function handleDelete(item: HfaIndicatorVariantItem) {
    const deleteAction = createDeleteAction(
      {
        text: t3({
          en: "Delete this variant item? Any per-item code authored for it will also be deleted.",
          fr: "Supprimer cet élément de variante ? Tout code par élément qui lui est associé sera également supprimé.",
          pt: "Eliminar este item de variante? Qualquer código por item associado também será eliminado.",
        }),
        itemList: [`${item.label} (${item.id})`],
      },
      () => serverActions.deleteHfaIndicatorVariantItem({ id: item.id }),
    );
    await deleteAction.click();
  }

  return (
    <>
      <div class="ui-gap-sm flex flex-none items-center pb-4">
        <div class="font-700 min-w-0 flex-1 truncate text-xl">
          {t3({ en: "Items", fr: "Éléments", pt: "Itens" })} ({items.length})
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
                en: "No items in this variant group",
                fr: "Aucun élément dans ce groupe de variantes",
                pt: "Nenhum item neste grupo de variantes",
              })}
            </div>
          }
        >
          <Show
            when={isAdmin()}
            fallback={
              <div class="ui-spy-sm">
                {items.map((it) => (
                  <div class="bg-base-200 flex items-center gap-2 rounded px-3 py-2">
                    <span class="flex-1">{it.label}</span>
                    <span class="ui-text-caption font-mono">{it.id}</span>
                  </div>
                ))}
              </div>
            }
          >
            <SortableList items={items} onReorder={handleReorder}>
              {(it) => (
                <div class="bg-base-200 flex items-center gap-2 rounded px-3 py-2">
                  <div class="min-w-0 flex-1">
                    <div class="truncate">{it.label}</div>
                    <div class="ui-text-caption font-mono">{it.id}</div>
                  </div>
                  <Button
                    onClick={() => handleEdit(it)}
                    iconName="pencil"
                    intent="base-100"
                    size="sm"
                  />
                  <Button
                    onClick={() => handleDelete(it)}
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
