import type { DashboardItem } from "lib";
import { t3 } from "lib";
import { Button } from "panther";
import { Show } from "solid-js";

type Props = {
  item: DashboardItem | undefined;
  selectedCount: number;
  canConfigure: boolean;
  onRename: () => void;
  onEdit: () => void;
  onSwitch: () => void;
  onCreate: () => void;
  onDelete: () => void;
};

export function DashboardItemEditor(p: Props) {
  return (
    <div class="flex h-full w-full flex-col overflow-auto">
      <Show
        when={p.item}
        fallback={
          <div class="ui-pad text-base-content-muted text-sm">
            <Show
              when={p.selectedCount > 1}
              fallback={t3({
                en: "Select an item to edit.",
                fr: "Sélectionnez un élément à modifier.",
                pt: "Selecione um elemento para editar.",
              })}
            >
              {t3({
                en: `${p.selectedCount} items selected. Select a single item to edit.`,
                fr: `${p.selectedCount} éléments sélectionnés. Sélectionnez-en un seul pour le modifier.`,
                pt: `${p.selectedCount} elementos selecionados. Selecione apenas um para editar.`,
              })}
            </Show>
          </div>
        }
      >
        {(item) => (
          <div class="ui-pad ui-spy">
            <div class="text-sm font-700">{item().label}</div>
            <Show when={p.canConfigure}>
              <div class="ui-gap-sm flex flex-col">
                <Button onClick={() => p.onRename()}>
                  {t3({ en: "Rename", fr: "Renommer", pt: "Renomear" })}
                </Button>
                <Show when={item().figureBlock.bundle !== undefined}>
                  <Button onClick={() => p.onEdit()}>
                    {t3({
                      en: "Edit Visualization",
                      fr: "Modifier la visualisation",
                      pt: "Editar visualização",
                    })}
                  </Button>
                </Show>
                <Button onClick={() => p.onSwitch()}>
                  {t3({
                    en: "Switch Visualization",
                    fr: "Changer de visualisation",
                    pt: "Mudar de visualização",
                  })}
                </Button>
                <Button onClick={() => p.onCreate()}>
                  {t3({
                    en: "Create New Visualization",
                    fr: "Créer une nouvelle visualisation",
                    pt: "Criar nova visualização",
                  })}
                </Button>
                <Button intent="danger" outline onClick={() => p.onDelete()}>
                  {t3({ en: "Delete item", fr: "Supprimer l'élément", pt: "Eliminar elemento" })}
                </Button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
