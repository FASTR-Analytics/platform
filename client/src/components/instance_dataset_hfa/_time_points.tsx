import { t3, TC, type HfaTimePoint } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  Select,
  StateHolderFormError,
  timActionButton,
  timActionDelete,
  timActionForm,
} from "panther";
import { createSignal, For, Show } from "solid-js";
import { serverActions } from "~/server_actions";

const YEARS = Array.from({ length: 16 }, (_, i) => String(2020 + i));
const MONTHS = [
  { value: "01", label: "January" },
  { value: "02", label: "February" },
  { value: "03", label: "March" },
  { value: "04", label: "April" },
  { value: "05", label: "May" },
  { value: "06", label: "June" },
  { value: "07", label: "July" },
  { value: "08", label: "August" },
  { value: "09", label: "September" },
  { value: "10", label: "October" },
  { value: "11", label: "November" },
  { value: "12", label: "December" },
];

export function TimePointsView(
  p: EditorComponentProps<
    {
      timePoints: HfaTimePoint[];
      isGlobalAdmin: boolean;
      onRefresh: () => Promise<void>;
    },
    undefined
  >,
) {
  const [editingLabel, setEditingLabel] = createSignal<string | null>(null);
  const [editLabel, setEditLabel] = createSignal("");
  const [editYear, setEditYear] = createSignal("");
  const [editMonth, setEditMonth] = createSignal("");

  const [localTimePoints, setLocalTimePoints] = createSignal<HfaTimePoint[]>(
    [...p.timePoints].sort((a, b) => a.sortOrder - b.sortOrder)
  );

  function startEdit(tp: HfaTimePoint) {
    setEditingLabel(tp.label);
    setEditLabel(tp.label);
    setEditYear(tp.periodId.slice(0, 4));
    setEditMonth(tp.periodId.slice(4, 6));
  }

  function cancelEdit() {
    setEditingLabel(null);
  }

  const saveEdit = timActionForm(async () => {
    const oldLabel = editingLabel();
    if (!oldLabel) return { success: false, err: "No time point selected" };

    const newLabel = editLabel().trim();
    const newPeriodId = editYear() && editMonth() ? `${editYear()}${editMonth()}` : undefined;

    if (!newLabel) {
      return { success: false, err: t3({ en: "Label cannot be empty", fr: "Le libellé ne peut pas être vide" }) };
    }

    const res = await serverActions.updateHfaTimePoint({
      oldLabel,
      newLabel: newLabel !== oldLabel ? newLabel : undefined,
      periodId: newPeriodId,
    });

    if (res.success) {
      setEditingLabel(null);
      await p.onRefresh();
      setLocalTimePoints([...p.timePoints].sort((a, b) => a.sortOrder - b.sortOrder));
    }

    return res;
  });

  async function handleDelete(label: string) {
    const deleteAction = timActionDelete(
      t3({ en: `Delete time point "${label}" and all its data?`, fr: `Supprimer le point temporel « ${label} » et toutes ses données ?` }),
      () => serverActions.deleteHfaTimePoint({ label }),
      async () => {
        await p.onRefresh();
        setLocalTimePoints((prev) => prev.filter((tp) => tp.label !== label));
      },
    );
    await deleteAction.click();
  }

  async function moveUp(index: number) {
    if (index <= 0) return;
    const newOrder = [...localTimePoints()];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setLocalTimePoints(newOrder);
    await serverActions.reorderHfaTimePoints({ order: newOrder.map((tp) => tp.label) });
    await p.onRefresh();
  }

  async function moveDown(index: number) {
    const tps = localTimePoints();
    if (index >= tps.length - 1) return;
    const newOrder = [...tps];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setLocalTimePoints(newOrder);
    await serverActions.reorderHfaTimePoints({ order: newOrder.map((tp) => tp.label) });
    await p.onRefresh();
  }

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Time Points", fr: "Points temporels" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <Show
          when={localTimePoints().length > 0}
          fallback={<div class="text-base-content/50">{t3({ en: "No time points", fr: "Aucun point temporel" })}</div>}
        >
          <div class="ui-spy">
            <For each={localTimePoints()}>
              {(tp, index) => (
                <div class="border-base-300 flex items-center gap-4 border-b py-3">
                  <Show
                    when={editingLabel() === tp.label}
                    fallback={
                      <>
                        <div class="w-8 text-center font-mono text-sm opacity-50">
                          {index() + 1}
                        </div>
                        <div class="flex-1">
                          <div class="font-700">{tp.label}</div>
                          <div class="text-base-content/60 text-sm">
                            {tp.periodId.slice(0, 4)}-{tp.periodId.slice(4, 6)}
                            {tp.importedAt && (
                              <span class="ml-4">
                                {t3({ en: "Imported", fr: "Importé" })}: {new Date(tp.importedAt).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>
                        <Show when={p.isGlobalAdmin}>
                          <div class="ui-gap-sm flex items-center">
                            <Button
                              iconName="chevronUp"
                              intent="base-100"
                              disabled={index() === 0}
                              onClick={() => moveUp(index())}
                            />
                            <Button
                              iconName="chevronDown"
                              intent="base-100"
                              disabled={index() === localTimePoints().length - 1}
                              onClick={() => moveDown(index())}
                            />
                            <Button
                              iconName="pencil"
                              intent="base-100"
                              onClick={() => startEdit(tp)}
                            />
                            <Button
                              iconName="trash"
                              intent="base-100"
                              onClick={() => handleDelete(tp.label)}
                            />
                          </div>
                        </Show>
                      </>
                    }
                  >
                    <div class="flex flex-1 flex-col gap-2">
                      <div class="flex items-end gap-4">
                        <div class="w-64">
                          <Input
                            label={t3({ en: "Label", fr: "Libellé" })}
                            value={editLabel()}
                            onChange={setEditLabel}
                            fullWidth
                          />
                        </div>
                        <div class="w-32">
                          <Select
                            label={t3({ en: "Year", fr: "Année" })}
                            options={YEARS.map((y) => ({ value: y, label: y }))}
                            value={editYear()}
                            onChange={setEditYear}
                            fullWidth
                          />
                        </div>
                        <div class="w-40">
                          <Select
                            label={t3({ en: "Month", fr: "Mois" })}
                            options={MONTHS}
                            value={editMonth()}
                            onChange={setEditMonth}
                            fullWidth
                          />
                        </div>
                      </div>
                      <StateHolderFormError state={saveEdit.state()} />
                      <div class="ui-gap-sm flex">
                        <Button
                          iconName="save"
                          intent="success"
                          state={saveEdit.state()}
                          onClick={saveEdit.click}
                        >
                          {t3(TC.save)}
                        </Button>
                        <Button intent="neutral" onClick={cancelEdit}>
                          {t3(TC.cancel)}
                        </Button>
                      </div>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>
      </div>
    </FrameTop>
  );
}
