import { type HfaTimePoint, t3 } from "lib";
import {
  createDeleteAction,
  EditableList,
  FrameTop,
  HeadingBar,
  type ListItem,
  openAlert,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { HfaTimePointForm } from "./time_point_form.tsx";

type Props = {
  close: (v: undefined) => void;
};

export function InstanceHfaTimePoints(p: Props) {
  return (
    <FrameTop
      pad="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={t3({
            en: "HFA time points",
            fr: "Points temporels HFA",
            pt: "Pontos temporais HFA",
          })}
        />
      }
    >
      <HfaTimePointsEditor />
    </FrameTop>
  );
}

export function HfaTimePointsEditor() {
  // null = form closed; no timePoint = adding
  const [editing, setEditing] = createSignal<
    { timePoint?: HfaTimePoint } | null
  >(null);

  const sortedTimePoints = () =>
    [...instanceState.hfaTimePoints].sort((a, b) => a.sortOrder - b.sortOrder);

  // Bumped on a failed reorder to force the list back to the store's order
  // (the reorderable list holds an optimistic local order; a failed save
  // changes nothing in the store, so nothing would otherwise re-sync it).
  const [listResyncKey, setListResyncKey] = createSignal(0);

  const items = (): ListItem<string>[] => {
    listResyncKey();
    return sortedTimePoints().map((tp) => ({
      id: tp.label,
      label: tp.label,
      sublabel: `${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)}${
        tp.importedAt
          ? ` — ${t3({ en: "Imported", fr: "Importé" })}: ${
            new Date(tp.importedAt).toLocaleDateString()
          }`
          : ""
      }`,
    }));
  };

  function openAdd() {
    setEditing({});
  }

  function openEdit(label: string) {
    const timePoint = sortedTimePoints().find((t) => t.label === label);
    if (timePoint) setEditing({ timePoint });
  }

  async function handleDelete(ids: string[]) {
    const label = ids[0];
    if (!label) return;
    const deleteAction = createDeleteAction(
      t3({
        en:
          `Delete time point "${label}", all its data, and its sampling weights?`,
        fr:
          `Supprimer le point temporel « ${label} », toutes ses données et ses pondérations d'échantillonnage ?`,
        pt:
          `Eliminar o ponto temporal "${label}", todos os seus dados e as suas ponderações de amostragem?`,
      }),
      () => serverActions.deleteHfaTimePoint({ label }),
      () => {
        if (editing()?.timePoint?.label === label) {
          setEditing(null);
        }
      },
    );
    await deleteAction.click();
  }

  async function handleReorder(orderedIds: string[]) {
    const res = await serverActions.reorderHfaTimePoints({ order: orderedIds });
    if (!res.success) {
      setListResyncKey((k) => k + 1);
      await openAlert({
        text: t3({
          en: "Could not save the new order",
          fr: "Impossible d'enregistrer le nouvel ordre",
        }),
        intent: "danger",
      });
    }
  }

  return (
    <div class="ui-spy max-w-3xl">
      <Show when={editing()} keyed>
        {(form) => (
          <HfaTimePointForm
            timePoint={form.timePoint}
            onSaved={() => setEditing(null)}
            onCancel={() => setEditing(null)}
          />
        )}
      </Show>
      <EditableList
        items={items()}
        title={t3({
          en: "Time points",
          fr: "Points temporels",
          pt: "Pontos temporais",
        })}
        showCount
        onAdd={openAdd}
        addLabel={t3({
          en: "Add time point",
          fr: "Ajouter un point temporel",
          pt: "Adicionar ponto temporal",
        })}
        onEdit={openEdit}
        onDelete={handleDelete}
        onReorder={handleReorder}
        readOnly={!instanceState.currentUserIsGlobalAdmin}
        emptyMessage={t3({
          en: "No time points. Add one here or in the data import.",
          fr:
            "Aucun point temporel. Ajoutez-en un ici ou dans l'importation des données.",
          pt:
            "Nenhum ponto temporal. Adicione um aqui ou na importação de dados.",
        })}
        renderItem={(item) => (
          <div class="min-w-0 flex-1 rounded border px-3 py-2">
            <div class="font-700 truncate text-sm">{item.label}</div>
            <Show when={item.sublabel}>
              <div class="ui-text-caption truncate">{item.sublabel}</div>
            </Show>
          </div>
        )}
        fullWidth
      />
    </div>
  );
}
