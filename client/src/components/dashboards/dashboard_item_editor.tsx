import type { DashboardItem } from "lib";
import { t3 } from "lib";
import { Button, Input } from "panther";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";

type Props = {
  item: DashboardItem | undefined;
  selectedCount: number;
  canConfigure: boolean;
  onUpdateLabel: (itemId: string, label: string) => void;
  onEdit: () => void;
  onSwitch: () => void;
  onCreate: () => void;
  onDelete: () => void;
};

export function DashboardItemEditor(p: Props) {
  const [labelDraft, setLabelDraft] = createSignal("");
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function clearDebounce() {
    if (debounce) {
      clearTimeout(debounce);
      debounce = undefined;
    }
  }

  // Reseed the draft whenever the selected item changes (incl. SSE updates),
  // and cancel any pending commit so it can't fire against the new item.
  createEffect(
    on(
      () => p.item?.id,
      () => {
        clearDebounce();
        setLabelDraft(p.item?.label ?? "");
      },
    ),
  );
  onCleanup(clearDebounce);

  function onLabelInput(v: string) {
    setLabelDraft(v);
    // Bind the commit to the item being edited NOW, not whatever is selected
    // when the timer fires (selection may change mid-debounce).
    const itemId = p.item?.id;
    const origLabel = p.item?.label;
    clearDebounce();
    debounce = setTimeout(() => {
      const next = v.trim();
      if (itemId && next && next !== origLabel) p.onUpdateLabel(itemId, next);
    }, 500);
  }

  return (
    <div class="flex h-full w-full flex-col overflow-auto">
      <Show
        when={p.item}
        fallback={
          <div class="ui-pad text-base-content/60 text-sm">
            <Show
              when={p.selectedCount > 1}
              fallback={t3({
                en: "Select an item to edit.",
                fr: "Sélectionnez un élément à modifier.",
              })}
            >
              {t3({
                en: `${p.selectedCount} items selected. Select a single item to edit.`,
                fr: `${p.selectedCount} éléments sélectionnés. Sélectionnez-en un seul pour le modifier.`,
              })}
            </Show>
          </div>
        }
      >
        {(item) => (
          <div class="ui-pad ui-spy">
            <Input
              label={t3({ en: "Label", fr: "Étiquette" })}
              value={labelDraft()}
              onChange={onLabelInput}
              disabled={!p.canConfigure}
              fullWidth
            />
            <Show when={p.canConfigure}>
              <div class="ui-gap-sm flex flex-col">
                <Show
                  when={
                    item().figureBlock.figureInputs &&
                    item().figureBlock.source?.type === "from_data"
                  }
                >
                  <Button onClick={() => p.onEdit()}>
                    {t3({
                      en: "Edit Visualization",
                      fr: "Modifier la visualisation",
                    })}
                  </Button>
                </Show>
                <Button onClick={() => p.onSwitch()}>
                  {t3({
                    en: "Switch Visualization",
                    fr: "Changer de visualisation",
                  })}
                </Button>
                <Button onClick={() => p.onCreate()}>
                  {t3({
                    en: "Create New Visualization",
                    fr: "Créer une nouvelle visualisation",
                  })}
                </Button>
                <Button intent="danger" outline onClick={() => p.onDelete()}>
                  {t3({ en: "Delete item", fr: "Supprimer l'élément" })}
                </Button>
              </div>
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
}
