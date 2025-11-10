import { T, t, t2 } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  timActionDelete,
} from "panther";
import { createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function DeleteData(
  p: EditorComponentProps<
    {
      isGlobalAdmin: boolean;
      silentFetch: () => Promise<void>;
    },
    undefined
  >,
) {
  const [checkText, setCheckText] = createSignal("");

  async function attemptDeleteData() {
    const deleteAction = timActionDelete(
      "Are you very sure you want to delete all of your data?",
      () => serverActions.deleteAllDatasetHfaData({}),
      p.silentFetch,
      () => p.close(undefined),
    );

    await deleteAction.click();
  }

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
        <div class="">
          If you want to delete all the data, write{" "}
          <span class="font-700">yes please delete</span> in the input box
        </div>
        <div class="w-96">
          <Input value={checkText()} onChange={setCheckText} />
        </div>
        <div class="">
          <Button
            intent="danger"
            iconName="trash"
            disabled={checkText() !== "yes please delete"}
            onClick={attemptDeleteData}
          >
            Delete
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
