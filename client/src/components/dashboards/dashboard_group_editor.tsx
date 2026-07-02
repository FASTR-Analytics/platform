import type { DashboardItemGroup } from "lib";
import { t3 } from "lib";
import { Button, Select } from "panther";
import { Show } from "solid-js";

type Props = {
  group: DashboardItemGroup;
  canConfigure: boolean;
  onRename: () => void;
  onSetDefaultReplicant: (value: string) => void;
  onSwitch: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

export function DashboardGroupEditor(p: Props) {
  const defaultValue = () =>
    p.group.defaultReplicantValue ?? p.group.replicants[0]?.value ?? "";

  return (
    <div class="flex h-full w-full flex-col overflow-auto">
      <div class="ui-pad ui-spy">
        <div class="text-neutral text-xs">
          {t3({
            en: `Replicant group · ${p.group.replicants.length} replicants`,
            fr: `Groupe de réplicants · ${p.group.replicants.length} réplicants`,
            pt: `Grupo de replicantes · ${p.group.replicants.length} replicantes`,
          })}
        </div>
        <div class="text-sm font-700">{p.group.label}</div>
        <Select
          label={t3({ en: "Default replicant", fr: "Réplicant par défaut", pt: "Replicante predefinido" })}
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
            <Button onClick={() => p.onRename()}>
              {t3({ en: "Rename", fr: "Renommer", pt: "Renomear" })}
            </Button>
            <Button onClick={() => p.onEdit()}>
              {t3({
                en: "Edit Visualization",
                fr: "Modifier la visualisation",
                pt: "Editar visualização",
              })}
            </Button>
            <Button onClick={() => p.onSwitch()}>
              {t3({
                en: "Switch Visualization",
                fr: "Changer de visualisation",
                pt: "Mudar de visualização",
              })}
            </Button>
            <Button intent="danger" outline onClick={() => p.onDelete()}>
              {t3({ en: "Delete group", fr: "Supprimer le groupe", pt: "Eliminar grupo" })}
            </Button>
          </div>
        </Show>
      </div>
    </div>
  );
}
