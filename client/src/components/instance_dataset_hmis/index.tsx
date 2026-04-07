import {
  t3,
  type DatasetUploadAttemptSummary,
} from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  getEditorWrapper,
  timActionButton,
  toPct0,
} from "panther";
import {
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { DatasetHmisUploadAttemptForm } from "~/components/instance_dataset_hmis_import";
import { serverActions } from "~/server_actions";
import { instanceState, getIndicatorMappingsVersion, getInstanceFacilityColumns } from "~/state/instance_state";
import { DeleteData } from "./_delete_data";
import { PreviousImports } from "./_previous_imports";
import { DatasetItemsHolder } from "./dataset_items_holder";

type Props = {
  backToInstance: () => void;
  isGlobalAdmin: boolean;
};

export function InstanceDatasetHmis(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [uploadAttempt, setUploadAttempt] = createSignal<
    DatasetUploadAttemptSummary | undefined
  >(undefined);

  async function fetchUploadAttempt() {
    try {
      const result = await serverActions.getDatasetHmisDetail({});
      if (result.success) {
        setUploadAttempt(result.data.uploadAttempt);
      }
    } catch {
      // Silent fail
    }
  }

  let pollingInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    fetchUploadAttempt();
    pollingInterval = setInterval(async () => {
      if (uploadAttempt() !== undefined) {
        await fetchUploadAttempt();
      }
    }, 5000);
  });

  onCleanup(() => {
    if (pollingInterval !== undefined) {
      clearInterval(pollingInterval);
    }
  });

  const newUploadAttempt = timActionButton(
    () => serverActions.createDatasetUploadAttempt({}),
    fetchUploadAttempt,
    openUploadAttempt,
  );

  async function openUploadAttempt() {
    await openEditor({
      element: DatasetHmisUploadAttemptForm,
      props: {
        silentFetch: fetchUploadAttempt,
      },
    });
  }

  async function viewPreviousImports() {
    await openEditor({
      element: PreviousImports,
      props: {
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });
  }

  async function deleteData() {
    const versionId = instanceState.datasetVersions.hmis;
    if (versionId === undefined) return;
    await openEditor({
      element: DeleteData,
      props: {
        hmisVersionId: versionId,
        indicatorMappingsVersion: getIndicatorMappingsVersion(),
        isGlobalAdmin: p.isGlobalAdmin,
        facilityColumns: getInstanceFacilityColumns(),
        silentFetch: fetchUploadAttempt,
      },
    });
  }

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
          </div>
        }
      >
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
                <Show when={instanceState.hmisNVersions > 0}>
                  <div class="ui-spy text-sm">
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
              when={instanceState.datasetVersions.hmis}
              fallback={
                <div class="ui-pad">
                  {t3({ en: "No data", fr: "Aucune donnée" })}
                </div>
              }
              keyed
            >
              {(versionId) => (
                <DatasetItemsHolder
                  versionId={versionId}
                  indicatorMappingsVersion={getIndicatorMappingsVersion()}
                  facilityColumns={getInstanceFacilityColumns()}
                />
              )}
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
