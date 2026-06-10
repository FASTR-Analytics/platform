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
  let pendingCommit: (() => void) | undefined;

  // Flush (not drop) any pending label commit before the editor unmounts or the
  // selection changes — otherwise navigating away / switching within the debounce
  // window silently loses the edit. The commit is bound to the captured item id,
  // so flushing after the selection moved still saves the right item.
  function flushPending() {
    if (debounce) {
      clearTimeout(debounce);
      debounce = undefined;
    }
    if (pendingCommit) {
      pendingCommit();
      pendingCommit = undefined;
    }
  }

  // Commit the previous item's pending label, then reseed the draft whenever the
  // selected item changes (incl. SSE updates).
  createEffect(
    on(
      () => p.item?.id,
      () => {
        flushPending();
        setLabelDraft(p.item?.label ?? "");
      },
    ),
  );
  onCleanup(flushPending);

  function onLabelInput(v: string) {
    setLabelDraft(v);
    // Bind the commit to the item being edited NOW, not whatever is selected
    // when the timer fires (selection may change mid-debounce).
    const itemId = p.item?.id;
    const origLabel = p.item?.label;
    if (debounce) clearTimeout(debounce);
    pendingCommit = () => {
      const next = v.trim();
      if (itemId && next && next !== origLabel) p.onUpdateLabel(itemId, next);
    };
    debounce = setTimeout(() => {
      pendingCommit?.();
      pendingCommit = undefined;
      debounce = undefined;
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
