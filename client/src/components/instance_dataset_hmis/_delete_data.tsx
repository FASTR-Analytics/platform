import {
  DEFAULT_PERIOD_END,
  DEFAULT_PERIOD_START,
  T,
  t,
  t2,
  type DatasetHmisWindowingRaw,
  type InstanceConfigFacilityColumns,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Input,
  timActionDelete,
} from "panther";
import { createSignal } from "solid-js";
import { createStore, unwrap } from "solid-js/store";
import { serverActions } from "~/server_actions";
import { WindowingSelector } from "../WindowingSelector";

export function DeleteData(
  p: EditorComponentProps<
    {
      hmisVersionId: number;
      indicatorMappingsVersion: string;
      isGlobalAdmin: boolean;
      silentFetch: () => Promise<void>;
      facilityColumns: InstanceConfigFacilityColumns;
    },
    undefined
  >,
) {
  const [tempWindowing, setTempWindowing] =
    createStore<DatasetHmisWindowingRaw>(
      structuredClone({
        indicatorType: "raw",
        start: DEFAULT_PERIOD_START,
        end: DEFAULT_PERIOD_END,
        takeAllIndicators: true,
        takeAllAdminArea2s: true,
        rawIndicatorsToInclude: [],
        adminArea2sToInclude: [],
      }),
    );

  const [checkText, setCheckText] = createSignal("");

  async function attemptDeleteData() {
    const windowing = unwrap(tempWindowing);

    const deleteAction = timActionDelete(
      "Are you sure you want to delete this data?",
      async () => {
        if (
          !windowing.takeAllIndicators &&
          windowing.rawIndicatorsToInclude.length === 0
        ) {
          return {
            success: false,
            err: "You must select at least one indicator",
          };
        }

        if (
          !windowing.takeAllAdminArea2s &&
          windowing.adminArea2sToInclude.length === 0
        ) {
          return {
            success: false,
            err: "You must select at least one admin area",
          };
        }

        return serverActions.deleteAllDatasetHmisData({ windowing });
      },
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
          <WindowingSelector
            hmisVersionId={p.hmisVersionId}
            indicatorMappingsVersion={p.indicatorMappingsVersion}
            tempWindowing={tempWindowing}
            setTempWindowing={setTempWindowing}
            includeOrDelete="delete"
            facilityColumns={p.facilityColumns}
          />
        </div>
        <div class="ui-spy-sm">
          <div class="">
            If you want to delete this data, write{" "}
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
      </div>
    </FrameTop>
  );
}
