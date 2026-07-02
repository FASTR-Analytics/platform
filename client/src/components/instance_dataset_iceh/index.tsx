import {
  t3,
  type IcehDataDetail,
  type IcehUploadAttemptSummary,
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
import { DatasetIcehUploadAttemptForm } from "~/components/instance_dataset_iceh_import";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { DatasetItemsHolder } from "./dataset_items_holder";
import { DeleteData } from "./_delete_data";

type Props = {
  backToInstance: () => void;
};

export function InstanceDatasetIceh(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [detail, setDetail] = createSignal<IcehDataDetail | undefined>(
    undefined
  );
  const [uploadAttempt, setUploadAttempt] = createSignal<
    IcehUploadAttemptSummary | undefined
  >(undefined);

  async function fetchDetail() {
    try {
      const result = await serverActions.getDatasetIcehDetail({});
      if (result.success) {
        setDetail(result.data);
        setUploadAttempt(result.data.uploadAttempt);
      }
    } catch {
      // Silent fail
    }
  }

  let pollingInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    fetchDetail();
    pollingInterval = setInterval(async () => {
      if (uploadAttempt() !== undefined) {
        await fetchDetail();
      }
    }, 5000);
  });

  onCleanup(() => {
    if (pollingInterval !== undefined) {
      clearInterval(pollingInterval);
    }
  });

  const newUploadAttempt = createButtonAction(
    () => serverActions.createDatasetIcehUploadAttempt({}),
    fetchDetail,
    openUploadAttempt
  );

  async function openUploadAttempt() {
    await openEditor({
      element: DatasetIcehUploadAttemptForm,
      props: {
        silentFetch: fetchDetail,
      },
    });
  }

  async function deleteData() {
    await openEditor({
      element: DeleteData,
      props: {
        silentFetch: fetchDetail,
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
                {t3({ en: "ICEH Equity Data", fr: "Données d'équité ICEH" })}
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
                                keyedUploadAttempt.status.status === "complete"
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
                                keyedUploadAttempt.status.status === "error"
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
                                keyedUploadAttempt.status.status === "staging"
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
                                    ((keyedUploadAttempt.status as any)
                                      ?.progress ?? 0) / 100
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
                                    ((keyedUploadAttempt.status as any)
                                      ?.progress ?? 0) / 100
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
                <Show when={detail() && detail()!.dataRows > 0}>
                  <div class="ui-spy text-sm">
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
              when={detail() && detail()!.dataRows > 0}
              fallback={
                <div class="ui-pad">
                  {t3({ en: "No data", fr: "Aucune donnée" })}
                </div>
              }
            >
              <DatasetItemsHolder />
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
