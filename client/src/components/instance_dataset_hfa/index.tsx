import { t, t2, T, type DatasetUploadAttemptSummary, type InstanceDetail } from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  StateHolderWrapper,
  getEditorWrapper,
  timActionButton,
  timQuery,
  toPct0,
  type TimQuery,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { DatasetHfaUploadAttemptForm } from "~/components/instance_dataset_hfa_import";
import { serverActions } from "~/server_actions";
import { DeleteData } from "./_delete_data";
import { PreviousImports } from "./_previous_imports";
import { DatasetItemsHolder } from "./dataset_items_holder";

type Props = {
  backToInstance: () => void;
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceDatasetHfa(p: Props) {
  // Utils

  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Query state

  const datasetDetail = timQuery(
    () => serverActions.getDatasetHfaDetail({}),
    "Loading data source...",
  );

  // Signal for upload attempt with polling
  const [uploadAttempt, setUploadAttempt] = createSignal<
    DatasetUploadAttemptSummary | undefined
  >(
    (() => {
      const state = datasetDetail.state();
      return state.status === "ready" ? state.data.uploadAttempt : undefined;
    })(),
  );

  // Update uploadAttempt when datasetDetail changes
  createEffect(() => {
    const state = datasetDetail.state();
    if (state.status === "ready") {
      setUploadAttempt(state.data.uploadAttempt);
    }
  });

  // Polling logic for upload attempt
  let pollingInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    pollingInterval = setInterval(async () => {
      if (uploadAttempt() !== undefined) {
        try {
          const result = await serverActions.getDatasetHfaDetail({});
          if (result.success) {
            setUploadAttempt(result.data.uploadAttempt);
          }
        } catch (error) {
          // Silent fail for polling
        }
      }
    }, 5000);
  });

  onCleanup(() => {
    if (pollingInterval !== undefined) {
      clearInterval(pollingInterval);
    }
  });

  // Actions

  const newUploadAttempt = timActionButton(
    () => serverActions.createDatasetHfaUploadAttempt({}),
    datasetDetail.silentFetch,
    openUploadAttempt,
  );

  async function openUploadAttempt() {
    const _res = await openEditor({
      element: DatasetHfaUploadAttemptForm,
      props: {
        silentFetch: async () => {
          await datasetDetail.silentFetch();
          const state = datasetDetail.state();
          if (state.status === "ready") {
            setUploadAttempt(state.data.uploadAttempt);
          }
          await p.instanceDetail.silentFetch();
        },
      },
    });
  }

  async function viewPreviousImports() {
    const _res = await openEditor({
      element: PreviousImports,
      props: {
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });
  }

  async function deleteData() {
    const _res = await openEditor({
      element: DeleteData,
      props: {
        isGlobalAdmin: p.isGlobalAdmin,
        silentFetch: async () => {
          await datasetDetail.silentFetch();
          await p.instanceDetail.silentFetch();
        },
      },
    });
  }

  // Helpers

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 flex-1 truncate text-xl">
              {t2(T.FRENCH_UI_STRINGS.data_source)}
              <span class="font-400 ml-4">Health Facility Assessment Data</span>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Button iconName="refresh" onClick={datasetDetail.fetch} />
            </div>
          </div>
        }
      >
        <StateHolderWrapper
          state={p.instanceDetail.state()}
          onErrorButton={{
            label: t("Go back to project"),
            onClick: p.backToInstance,
          }}
        >
          {(keyedInstanceDetail) => {
            return (
              <StateHolderWrapper
                state={datasetDetail.state()}
                onErrorButton={{
                  label: t("Go back to project"),
                  onClick: p.backToInstance,
                }}
              >
                {(keyedDatasetDetail) => {
                  return (
                    <FrameRight
                      panelChildren={
                        <Show when={p.isGlobalAdmin}>
                          <div class="ui-pad ui-spy border-base-300 flex h-full w-64 flex-col overflow-auto border-l">
                            <div class="font-700 text-lg">{t2(T.FRENCH_UI_STRINGS.imports)}</div>
                            <Switch>
                              <Match when={!uploadAttempt()}>
                                <div class="">
                                  <Button
                                    onClick={newUploadAttempt.click}
                                    state={newUploadAttempt.state()}
                                    iconName="upload"
                                    fullWidth
                                  >
                                    {t2(T.FRENCH_UI_STRINGS.start_new_import)}
                                  </Button>
                                </div>
                              </Match>
                              <Match when={uploadAttempt()} keyed>
                                {(keyedUploadAttempt) => {
                                  return (
                                    <div
                                      class="ui-hoverable ui-pad border-base-300 bg-base-200 rounded border"
                                      onClick={openUploadAttempt}
                                    >
                                      <Switch>
                                        <Match
                                          when={
                                            keyedUploadAttempt.status.status ===
                                            "complete"
                                          }
                                        >
                                          <div class="text-sm">
                                            Import is complete! Click to view
                                            and remove.
                                          </div>
                                        </Match>
                                        <Match
                                          when={
                                            keyedUploadAttempt.status.status ===
                                            "error"
                                          }
                                        >
                                          <div class="text-danger text-sm">
                                            Error with upload. Click to view.
                                          </div>
                                        </Match>
                                        <Match
                                          when={
                                            keyedUploadAttempt.status.status ===
                                            "staging"
                                          }
                                          keyed
                                        >
                                          <div class="ui-spy-sm text-center">
                                            <div class="">Staging underway</div>
                                            <div class="font-700 text-lg">
                                              {toPct0(
                                                ((
                                                  keyedUploadAttempt.status as any
                                                )?.progress ?? 0) / 100,
                                              )}
                                            </div>
                                            <div class="text-xs">
                                              This number will automatically
                                              update. No need to refresh.
                                            </div>
                                          </div>
                                        </Match>
                                        <Match
                                          when={
                                            keyedUploadAttempt.status.status ===
                                            "integrating"
                                          }
                                          keyed
                                        >
                                          <div class="ui-spy-sm text-center">
                                            <div class="">
                                              Integrating underway
                                            </div>
                                            <div class="font-700 text-lg">
                                              {toPct0(
                                                //@ts-ignore
                                                ((
                                                  keyedUploadAttempt.status as any
                                                )?.progress ?? 0) / 100,
                                              )}
                                            </div>
                                            <div class="text-xs">
                                              This number will automatically
                                              update. No need to refresh.
                                            </div>
                                          </div>
                                        </Match>
                                        <Match when={true}>
                                          <div class="text-sm">
                                            Import in draft stage. Click to
                                            continue.
                                          </div>
                                        </Match>
                                      </Switch>
                                    </div>
                                  );
                                }}
                              </Match>
                            </Switch>
                            <Show when={keyedDatasetDetail.nVersions > 0}>
                              <div class="ui-spy text-sm">
                                {/* <div class="">
                            {keyedDatasetDetail.nVersions} previous import
                            {keyedDatasetDetail.nVersions !== 1 ? "s" : ""}
                          </div> */}
                                <div class="">
                                  <Button
                                    onClick={viewPreviousImports}
                                    outline
                                    fullWidth
                                    iconName="folder"
                                  >
                                    View previous imports
                                  </Button>
                                </div>
                                <div class="">
                                  <Button
                                    onClick={deleteData}
                                    intent="danger"
                                    iconName="trash"
                                    outline
                                    fullWidth
                                  >
                                    Delete data
                                  </Button>
                                </div>
                              </div>
                            </Show>
                          </div>
                        </Show>
                      }
                    >
                      <div class="h-full w-full">
                        <Show
                          when={keyedDatasetDetail.currentVersionId}
                          fallback={<div class="ui-pad">{t("No data")}</div>}
                        >
                          <DatasetItemsHolder
                            versionId={keyedDatasetDetail.currentVersionId!}
                          />
                        </Show>
                      </div>
                    </FrameRight>
                  );
                }}
              </StateHolderWrapper>
            );
          }}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
