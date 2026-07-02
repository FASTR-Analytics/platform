import { t3, TC } from "lib";
import {
  Button,
  EditableList,
  FrameTop,
  Input,
  type ListItem,
  MonthSelect,
  StateHolderFormError,
  createDeleteAction,
  createFormAction,
  YearSelect,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";

type Props = {
  backToInstance: () => void;
};

export function InstanceHfaTimePoints(p: Props) {
  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={p.backToInstance} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "HFA time points", fr: "Points temporels HFA" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <HfaTimePointsEditor />
      </div>
    </FrameTop>
  );
}

export function HfaTimePointsEditor() {
  // null = form closed; "" = adding; otherwise the label being edited
  const [editing, setEditing] = createSignal<string | null>(null);
  const [formLabel, setFormLabel] = createSignal("");
  const [formYear, setFormYear] = createSignal("");
  const [formMonth, setFormMonth] = createSignal("");

  const sortedTimePoints = () =>
    [...instanceState.hfaTimePoints].sort((a, b) => a.sortOrder - b.sortOrder);

  const items = (): ListItem<string>[] =>
    sortedTimePoints().map((tp) => ({
      id: tp.label,
      label: tp.label,
      sublabel: `${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)}${
        tp.importedAt
          ? ` — ${t3({ en: "Imported", fr: "Importé" })}: ${new Date(tp.importedAt).toLocaleDateString()}`
          : ""
      }`,
    }));

  function openAdd() {
    setEditing("");
    setFormLabel("");
    setFormYear("");
    setFormMonth("");
  }

  function openEdit(label: string) {
    const tp = sortedTimePoints().find((t) => t.label === label);
    if (!tp) return;
    setEditing(label);
    setFormLabel(tp.label);
    setFormYear(tp.periodId.slice(0, 4));
    setFormMonth(tp.periodId.slice(4, 6));
  }

  const saveForm = createFormAction(async () => {
    const label = formLabel().trim();
    if (!label) {
      return { success: false, err: t3({ en: "Label cannot be empty", fr: "Le libellé ne peut pas être vide" }) };
    }
    if (!formYear() || !formMonth()) {
      return { success: false, err: t3({ en: "You must select a year and month", fr: "Vous devez sélectionner une année et un mois" }) };
    }
    const periodId = `${formYear()}${formMonth()}`;
    const oldLabel = editing();
    const res = oldLabel === ""
      ? await serverActions.createHfaTimePoint({ label, periodId })
      : await serverActions.updateHfaTimePoint({
          oldLabel: oldLabel!,
          newLabel: label !== oldLabel ? label : undefined,
          periodId,
        });
    if (res.success) {
      setEditing(null);
    }
    return res;
  });

  async function handleDelete(ids: string[]) {
    const label = ids[0];
    if (!label) return;
    const deleteAction = createDeleteAction(
      t3({ en: `Delete time point "${label}", all its data, and its sampling weights?`, fr: `Supprimer le point temporel « ${label} », toutes ses données et ses pondérations d'échantillonnage ?` }),
      () => serverActions.deleteHfaTimePoint({ label }),
      () => {
        if (editing() === label) {
          setEditing(null);
        }
      },
    );
    await deleteAction.click();
  }

  async function handleReorder(orderedIds: string[]) {
    await serverActions.reorderHfaTimePoints({ order: orderedIds });
  }

  return (
    <div class="ui-spy max-w-3xl">
      <Show when={editing() !== null}>
        <div class="border-base-300 ui-spy rounded border p-4">
          <div class="font-700">
            {editing() === ""
              ? t3({ en: "Add time point", fr: "Ajouter un point temporel" })
              : t3({ en: "Edit time point", fr: "Modifier le point temporel" })}
          </div>
          <div class="flex items-end gap-4">
            <div class="w-64">
              <Input
                label={t3({ en: "Label", fr: "Libellé" })}
                value={formLabel()}
                onChange={setFormLabel}
                fullWidth
              />
            </div>
            <YearSelect
              label={t3({ en: "Year", fr: "Année" })}
              value={formYear()}
              onChange={setFormYear}
            />
            <MonthSelect
              label={t3({ en: "Month", fr: "Mois" })}
              value={formMonth()}
              onChange={setFormMonth}
            />
          </div>
          <StateHolderFormError state={saveForm.state()} />
          <div class="ui-gap-sm flex">
            <Button
              iconName="save"
              intent="success"
              state={saveForm.state()}
              onClick={saveForm.click}
            >
              {t3(TC.save)}
            </Button>
            <Button intent="neutral" onClick={() => setEditing(null)}>
              {t3(TC.cancel)}
            </Button>
          </div>
        </div>
      </Show>
      <EditableList
        items={items()}
        title={t3({ en: "Time points", fr: "Points temporels" })}
        showCount
        onAdd={openAdd}
        addLabel={t3({ en: "Add time point", fr: "Ajouter un point temporel" })}
        onEdit={openEdit}
        onDelete={handleDelete}
        onReorder={handleReorder}
        readOnly={!instanceState.currentUserIsGlobalAdmin}
        emptyMessage={t3({
          en: "No time points. Add a time point before importing HFA data or weights.",
          fr: "Aucun point temporel. Ajoutez un point temporel avant d'importer des données HFA ou des pondérations.",
        })}
        renderItem={(item) => (
          <div class="border-base-300 min-w-0 flex-1 rounded border px-3 py-2">
            <div class="font-700 truncate text-sm">{item.label}</div>
            <Show when={item.sublabel}>
              <div class="text-neutral truncate text-xs">{item.sublabel}</div>
            </Show>
          </div>
        )}
        fullWidth
      />
    </div>
  );
}
