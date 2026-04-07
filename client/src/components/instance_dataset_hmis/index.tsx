import {
  t3,
  TC,
  type DatasetUploadAttemptSummary,
  type InstanceDetail,
} from "lib";
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
import { DatasetHmisUploadAttemptForm } from "~/components/instance_dataset_hmis_import";
import { serverActions } from "~/server_actions";
import { DeleteData } from "./_delete_data";
import { PreviousImports } from "./_previous_imports";
import { DatasetItemsHolder } from "./dataset_items_holder";

type Props = {
  backToInstance: () => void;
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
};

export function InstanceDatasetHmis(p: Props) {
  // Utils

  const { openEditor, EditorWrapper } = getEditorWrapper();

  // Query state

  const datasetDetail = timQuery(
    () => serverActions.getDatasetHmisDetail({}),
    t3({
      en: "Loading data source...",
      fr: "Chargement de la source de données...",
    }),
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
          const result = await serverActions.getDatasetHmisDetail({});
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
    () => serverActions.createDatasetUploadAttempt({}),
    datasetDetail.silentFetch,
    openUploadAttempt,
  );

  async function openUploadAttempt() {
    const _res = await openEditor({
      element: DatasetHmisUploadAttemptForm,
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
    const instanceDetail = p.instanceDetail.state();
    if (instanceDetail.status !== "ready") {
      return;
    }
    const dd = datasetDetail.state();
    if (dd.status !== "ready") {
      return;
    }
    const _res = await openEditor({
      element: DeleteData,
      props: {
        hmisVersionId: dd.data.currentVersionId ?? 0,
        indicatorMappingsVersion:
          instanceDetail.data.cacheVersions.indicatorMappings,
        isGlobalAdmin: p.isGlobalAdmin,
        facilityColumns: instanceDetail.data.facilityColumns,
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
              {t3({ en: "DATA SOURCE", fr: "SOURCE DE DONNÉES" })}
              <span class="font-400 ml-4">
                {t3({ en: "HMIS Data", fr: "Données HMIS" })}
              </span>
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
            label: t3(TC.goBackToProject),
            onClick: p.backToInstance,
          }}
        >
          {(keyedInstanceDetail) => {
            return (
              <StateHolderWrapper
                state={datasetDetail.state()}
                onErrorButton={{
                  label: t3(TC.goBackToProject),
                  onClick: p.backToInstance,
                }}
              >
                {(keyedDatasetDetail) => {
                  return (
                    <FrameRight
                      panelChildren={
                        <Show when={p.isGlobalAdmin}>
                          <div class="ui-pad ui-spy border-base-300 flex h-full w-64 flex-col overflow-auto border-l">
                            <div class="font-700 text-lg">
                              {t3({ en: "Imports", fr: "Importations" })}
                            </div>
                            <Switch>
                              <Match when={!uploadAttempt()}>
                                <div class="">
                                  <Button
                                    onClick={newUploadAttempt.click}
                                    state={newUploadAttempt.state()}
                                    iconName="upload"
                                    fullWidth
                                  >
                                    {t3({
                                      en: "Start new import",
                                      fr: "Nouvelle importation",
                                    })}
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
                                            {t3({
                                              en: "Import is complete! Click to view and remove.",
                                              fr: "Importation terminée ! Cliquez pour consulter et supprimer.",
                                            })}
                                          </div>
                                        </Match>
                                        <Match
                                          when={
                                            keyedUploadAttempt.status.status ===
                                            "error"
                                          }
                                        >
                                          <div class="text-danger text-sm">
                                            {t3({
                                              en: "Error with upload. Click to view.",
                                              fr: "Erreur lors du téléversement. Cliquez pour consulter.",
                                            })}
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
                                            <div class="">
                                              {t3({
                                                en: "Staging underway",
                                                fr: "Préparation en cours",
                                              })}
                                            </div>
                                            <div class="font-700 text-lg">
                                              {toPct0(
                                                ((
                                                  keyedUploadAttempt.status as any
                                                )?.progress ?? 0) / 100,
                                              )}
                                            </div>
                                            <div class="text-xs">
                                              {t3({
                                                en: "This number will automatically update. No need to refresh.",
                                                fr: "Ce nombre se met à jour automatiquement. Pas besoin d'actualiser.",
                                              })}
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
                                              {t3({
                                                en: "Integrating underway",
                                                fr: "Intégration en cours",
                                              })}
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
                                              {t3({
                                                en: "This number will automatically update. No need to refresh.",
                                                fr: "Ce nombre se met à jour automatiquement. Pas besoin d'actualiser.",
                                              })}
                                            </div>
                                          </div>
                                        </Match>
                                        <Match when={true}>
                                          <div class="text-sm">
                                            {t3({
                                              en: "Import in draft stage. Click to continue.",
                                              fr: "Importation en cours de préparation. Cliquez pour continuer.",
                                            })}
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
                                    {t3({
                                      en: "View previous imports",
                                      fr: "Importations précédentes",
                                    })}
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
                                    {t3({
                                      en: "Delete data",
                                      fr: "Supprimer les données",
                                    })}
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
                          fallback={
                            <div class="ui-pad">
                              {t3({ en: "No data", fr: "Aucune donnée" })}
                            </div>
                          }
                        >
                          <DatasetItemsHolder
                            versionId={keyedDatasetDetail.currentVersionId!}
                            indicatorMappingsVersion={
                              keyedInstanceDetail.cacheVersions
                                .indicatorMappings
                            }
                            facilityColumns={
                              keyedInstanceDetail.facilityColumns
                            }
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
