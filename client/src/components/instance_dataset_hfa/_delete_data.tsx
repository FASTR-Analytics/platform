import { t3, TC, type HfaTimePoint } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  Select,
  createDeleteAction,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function DeleteData(
  p: EditorComponentProps<
    {
      timePoints: HfaTimePoint[];
    },
    undefined
  >,
) {
  const [checkText, setCheckText] = createSignal("");
  const [deleteMode, setDeleteMode] = createSignal<"all" | "time_point">(
    "all",
  );
  const [selectedTimePoint, setSelectedTimePoint] = createSignal("");

  async function attemptDeleteData() {
    const timePoint =
      deleteMode() === "time_point" ? selectedTimePoint() : undefined;
    const deleteAction = createDeleteAction(
      timePoint
        ? `Are you very sure you want to delete all data for time point "${timePoint}"?`
        : "Are you very sure you want to delete all of your data?",
      () => serverActions.deleteDatasetHfaData({ timePoint }),
      () => p.close(undefined),
    );

    await deleteAction.click();
  }

  const canDelete = () => {
    if (checkText() !== "yes please delete") return false;
    if (deleteMode() === "time_point" && !selectedTimePoint()) return false;
    return true;
  };

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3(TC.delete)}
          </div>
        </div>
      }
    >
      <div class="ui-pad ui-spy h-full w-full">
        <Show when={p.timePoints.length > 0}>
          <div class="flex gap-4">
            <Button
              onClick={() => setDeleteMode("all")}
              intent={deleteMode() === "all" ? "primary" : undefined}
              outline={deleteMode() !== "all"}
            >
              {t3({ en: "Delete all data", fr: "Supprimer toutes les données" })}
            </Button>
            <Button
              onClick={() => setDeleteMode("time_point")}
              intent={deleteMode() === "time_point" ? "primary" : undefined}
              outline={deleteMode() !== "time_point"}
            >
              {t3({ en: "Delete by time point", fr: "Supprimer par point temporel" })}
            </Button>
          </div>
        </Show>

        <Show when={deleteMode() === "time_point"}>
          <div class="w-96">
            <Select
              label={t3({ en: "Select time point to delete", fr: "Sélectionner le point temporel à supprimer" })}
              options={p.timePoints.map((tp) => ({
                value: tp.label,
                label: `${tp.label} (${tp.periodId.slice(0, 4)}-${tp.periodId.slice(4, 6)})`,
              }))}
              value={selectedTimePoint()}
              onChange={setSelectedTimePoint}
              fullWidth
            />
          </div>
        </Show>

        <div class="text-neutral text-sm">
          {t3({
            en: "Time points, sampling weights, and indicator code are kept. Manage time points on the HFA time points page.",
            fr: "Les points temporels, les pondérations d'échantillonnage et le code des indicateurs sont conservés. Gérez les points temporels sur la page des points temporels Enquêtes FOSA.",
          })}
        </div>

        <div class="">
          {t3({ en: "If you want to delete", fr: "Pour supprimer" })}{" "}
          {deleteMode() === "time_point"
            ? t3({ en: `data for time point "${selectedTimePoint()}"`, fr: `les données du point temporel « ${selectedTimePoint()} »` })
            : t3({ en: "all the data", fr: "toutes les données" })}
          , {t3({ en: "write", fr: "écrivez" })} <span class="font-700">yes please delete</span>{" "}
          {t3({ en: "in the input box", fr: "dans le champ de saisie" })}
        </div>
        <div class="w-96">
          <Input value={checkText()} onChange={setCheckText} />
        </div>
        <div class="">
          <Button
            intent="danger"
            iconName="trash"
            disabled={!canDelete()}
            onClick={attemptDeleteData}
          >
            {t3(TC.delete)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
