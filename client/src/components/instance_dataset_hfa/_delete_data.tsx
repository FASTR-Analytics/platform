import { T, t, t2, type DatasetHfaDictionaryTimePoint } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  Select,
  timActionDelete,
} from "panther";
import { createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";

export function DeleteData(
  p: EditorComponentProps<
    {
      isGlobalAdmin: boolean;
      timePoints: DatasetHfaDictionaryTimePoint[];
      silentFetch: () => Promise<void>;
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
    const deleteAction = timActionDelete(
      timePoint
        ? `Are you very sure you want to delete all data for time point "${timePoint}"?`
        : "Are you very sure you want to delete all of your data?",
      () => serverActions.deleteDatasetHfaData({ timePoint }),
      p.silentFetch,
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
            {t2(T.FRENCH_UI_STRINGS.delete)}
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
              {t("Delete all data")}
            </Button>
            <Button
              onClick={() => setDeleteMode("time_point")}
              intent={deleteMode() === "time_point" ? "primary" : undefined}
              outline={deleteMode() !== "time_point"}
            >
              {t("Delete by time point")}
            </Button>
          </div>
        </Show>

        <Show when={deleteMode() === "time_point"}>
          <div class="w-96">
            <Select
              label={t("Select time point to delete")}
              options={p.timePoints.map((tp) => ({
                value: tp.timePoint,
                label: `${tp.timePoint} (${tp.timePointLabel})`,
              }))}
              value={selectedTimePoint()}
              onChange={setSelectedTimePoint}
              fullWidth
            />
          </div>
        </Show>

        <div class="">
          {t("If you want to delete")}{" "}
          {deleteMode() === "time_point"
            ? `data for time point "${selectedTimePoint()}"`
            : "all the data"}
          , {t("write")} <span class="font-700">yes please delete</span>{" "}
          {t("in the input box")}
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
            {t2(T.FRENCH_UI_STRINGS.delete)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
