import {
  t3,
  type DatasetHmisImportRunSummary,
  type DatasetUploadAttemptSummary,
} from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  getEditorWrapper,
  createButtonAction,
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
import { DatasetHmisDhis2Runs } from "./dhis2_run";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { DeleteData } from "./_delete_data";
import { ImportLedger } from "./_import_ledger";
import { PreviousImports } from "./_previous_imports";
import { DatasetItemsHolder } from "./dataset_items_holder";

type Props = {
  backToInstance: () => void;
};

export function InstanceDatasetHmis(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [uploadAttempt, setUploadAttempt] = createSignal<
    DatasetUploadAttemptSummary | undefined
  >(undefined);
  const [activeDhis2Run, setActiveDhis2Run] = createSignal<
    DatasetHmisImportRunSummary | undefined
  >(undefined);

  async function fetchUploadAttempt() {
    try {
      const result = await serverActions.getDatasetHmisDetail({});
      if (result.success) {
        setUploadAttempt(result.data.uploadAttempt);
      }
      const runsResult = await serverActions.getDatasetHmisImportRuns({});
      if (runsResult.success) {
        setActiveDhis2Run(
          runsResult.data.find((r) => r.status === "running"),
        );
      }
    } catch {
      // Silent fail
    }
  }

  let pollingInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    fetchUploadAttempt();
    pollingInterval = setInterval(async () => {
      if (uploadAttempt() !== undefined || activeDhis2Run() !== undefined) {
        await fetchUploadAttempt();
      }
    }, 5000);
  });

  onCleanup(() => {
    if (pollingInterval !== undefined) {
      clearInterval(pollingInterval);
    }
  });

  // The wizard is CSV-only (DHIS2 imports are runs): the source type is set
  // at creation so the wizard opens straight at the CSV upload step.
  const newUploadAttempt = createButtonAction(
    async () => {
      const res = await serverActions.createDatasetUploadAttempt({});
      if (!res.success) {
        return res;
      }
      return await serverActions.setDatasetUploadSourceType({
        sourceType: "csv",
      });
    },
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

  async function openDhis2Runs() {
    await openEditor({
      element: DatasetHmisDhis2Runs,
      props: {
        silentFetch: fetchUploadAttempt,
      },
    });
  }

  async function viewPreviousImports() {
    await openEditor({
      element: PreviousImports,
      props: {
      },
    });
  }

  async function viewImportLedger() {
    await openEditor({
      element: ImportLedger,
      props: {},
    });
  }

  async function deleteData() {
    const versionId = instanceState.datasetVersions.hmis;
    if (versionId === undefined) return;
    await openEditor({
      element: DeleteData,
      props: {
        hmisVersionId: versionId,
        indicatorMappingsVersion: instanceState.indicatorMappingsVersion,
        facilityColumns: instanceState.facilityColumns,
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
              {t3({ en: "DATA SOURCE", fr: "SOURCE DE DONNÉES", pt: "FONTE DE DADOS" })}
              <span class="font-400 ml-4">
                {t3({ en: "HMIS Data", fr: "Données HMIS", pt: "Dados HMIS" })}
              </span>
            </div>
          </div>
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy border-base-300 flex h-full w-64 flex-col overflow-auto border-l">
                <div class="font-700 text-lg">
                  {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                </div>
                <Show when={instanceState.hmisScheduledImportAttention}>
                  <div
                    class="ui-hoverable ui-pad border-danger bg-danger/10 rounded border text-sm"
                    onClick={openDhis2Runs}
                  >
                    {t3({
                      en: "A scheduled DHIS2 import needs attention. Click to view.",
                      fr: "Une importation DHIS2 planifiée nécessite votre attention. Cliquez pour consulter.",
                      pt: "Uma importação DHIS2 agendada precisa de atenção. Clique para ver.",
                    })}
                  </div>
                </Show>
                <Switch>
                  <Match when={activeDhis2Run()} keyed>
                    {(keyedRun) => (
                      <div
                        class="ui-hoverable ui-pad border-base-300 bg-base-200 rounded border"
                        onClick={openDhis2Runs}
                      >
                        <div class="ui-spy-sm text-center">
                          <div class="">
                            {t3({
                              en: "DHIS2 import underway",
                              fr: "Importation DHIS2 en cours",
                              pt: "Importação DHIS2 em curso",
                            })}
                          </div>
                          <div class="font-700 text-lg">
                            {toPct0(
                              keyedRun.totalPairs > 0
                                ? (keyedRun.succeededPairs +
                                    keyedRun.failedPairs) /
                                    keyedRun.totalPairs
                                : 0,
                            )}
                          </div>
                          <div class="text-xs">
                            {t3({
                              en: "Click to view progress.",
                              fr: "Cliquez pour voir la progression.",
                              pt: "Clique para ver o progresso.",
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </Match>
                  <Match when={!activeDhis2Run()}>
                    <div class="">
                      <Button
                        onClick={openDhis2Runs}
                        iconName="databaseImport"
                        fullWidth
                      >
                        {t3({
                          en: "Import from DHIS2",
                          fr: "Importer depuis DHIS2",
                          pt: "Importar do DHIS2",
                        })}
                      </Button>
                    </div>
                  </Match>
                </Switch>
                <Show when={instanceState.hmisImportRunsQueued > 0}>
                  <div
                    class="ui-hoverable ui-pad border-base-300 bg-base-200 rounded border text-sm"
                    onClick={openDhis2Runs}
                  >
                    {instanceState.hmisImportRunsQueued}{" "}
                    {t3({
                      en: "DHIS2 import(s) queued. Click to view.",
                      fr: "importation(s) DHIS2 en file d'attente. Cliquez pour consulter.",
                      pt: "importação(ões) DHIS2 em fila. Clique para ver.",
                    })}
                  </div>
                </Show>
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
                          en: "Upload CSV file",
                          fr: "Téléverser un fichier CSV",
                          pt: "Carregar um ficheiro CSV",
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
                                  pt: "Importação concluída! Clique para ver e remover.",
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
                                  pt: "Erro no carregamento. Clique para ver.",
                                })}
                              </div>
                            </Match>
                            <Match
                              when={
                                keyedUploadAttempt.status.status === "staging"
                              }
                              keyed
                            >
                              <div class="ui-spy-sm text-center">
                                <div class="">
                                  {t3({
                                    en: "Staging underway",
                                    fr: "Préparation en cours",
                                    pt: "Preparação em curso",
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
                                    pt: "Este número atualiza-se automaticamente. Não é necessário atualizar a página.",
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
                                    pt: "Integração em curso",
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
                                    pt: "Este número atualiza-se automaticamente. Não é necessário atualizar a página.",
                                  })}
                                </div>
                              </div>
                            </Match>
                            <Match when={true}>
                              <div class="text-sm">
                                {t3({
                                  en: "Import in draft stage. Click to continue.",
                                  fr: "Importation en cours de préparation. Cliquez pour continuer.",
                                  pt: "Importação em fase de rascunho. Clique para continuar.",
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
                        onClick={viewImportLedger}
                        outline
                        fullWidth
                        iconName="databaseImport"
                      >
                        {t3({
                          en: "Import status by indicator",
                          fr: "État des importations par indicateur",
                          pt: "Estado das importações por indicador",
                        })}
                      </Button>
                    </div>
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
                          pt: "Ver importações anteriores",
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
                          pt: "Eliminar os dados",
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
                  {t3({ en: "No data", fr: "Aucune donnée", pt: "Sem dados" })}
                </div>
              }
              keyed
            >
              {(versionId) => (
                <DatasetItemsHolder
                  versionId={versionId}
                  indicatorMappingsVersion={instanceState.indicatorMappingsVersion}
                  facilityColumns={instanceState.facilityColumns}
                />
              )}
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
