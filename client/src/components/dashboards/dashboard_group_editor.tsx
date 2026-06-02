import type { DashboardItemGroup } from "lib";
import { t3 } from "lib";
import { Button, Input, Select } from "panther";
import { createEffect, createSignal, on, onCleanup, Show } from "solid-js";

type Props = {
  group: DashboardItemGroup;
  canConfigure: boolean;
  onUpdateLabel: (label: string) => void;
  onSetDefaultReplicant: (value: string) => void;
  onSwitch: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function DashboardGroupEditor(p: Props) {
  const [labelDraft, setLabelDraft] = createSignal("");
  let debounce: ReturnType<typeof setTimeout> | undefined;

  function clearDebounce() {
    if (debounce) {
      clearTimeout(debounce);
      debounce = undefined;
    }
  }

  createEffect(
    on(
      () => p.group.id,
      () => {
        clearDebounce();
        setLabelDraft(p.group.label);
      },
    ),
  );
  onCleanup(clearDebounce);

  function onLabelInput(v: string) {
    setLabelDraft(v);
    const groupId = p.group.id;
    const orig = p.group.label;
    clearDebounce();
    debounce = setTimeout(() => {
      const next = v.trim();
      if (groupId === p.group.id && next && next !== orig) {
        p.onUpdateLabel(next);
      }
    }, 500);
  }

  const defaultValue = () =>
    p.group.defaultReplicantValue ?? p.group.replicants[0]?.value ?? "";

  return (
    <div class="flex h-full w-full flex-col overflow-auto">
      <div class="ui-pad ui-spy">
        <div class="text-neutral text-xs">
          {t3({
            en: `Replicant group · ${p.group.replicants.length} replicants`,
            fr: `Groupe de réplicants · ${p.group.replicants.length} réplicants`,
          })}
        </div>
        <Input
          label={t3({ en: "Group label", fr: "Étiquette du groupe" })}
          value={labelDraft()}
          onChange={onLabelInput}
          disabled={!p.canConfigure}
          fullWidth
        />
        <Select
          label={t3({ en: "Default replicant", fr: "Réplicant par défaut" })}
          value={defaultValue()}
          options={p.group.replicants.map((r) => ({
            value: r.value,
            label: r.label,
          }))}
          onChange={(v: string) => p.onSetDefaultReplicant(v)}
          fullWidth
        />
        <Show when={p.canConfigure}>
          <div class="ui-gap-sm flex flex-col">
            <Button onClick={() => p.onEdit()}>
              {t3({
                en: "Edit Visualization",
                fr: "Modifier la visualisation",
              })}
            </Button>
            <Button onClick={() => p.onSwitch()}>
              {t3({
                en: "Switch Visualization",
                fr: "Changer de visualisation",
              })}
            </Button>
            <Button intent="danger" outline onClick={() => p.onDelete()}>
              {t3({ en: "Delete group", fr: "Supprimer le groupe" })}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
