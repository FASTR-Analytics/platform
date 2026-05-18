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
  timActionButton,
  timQuery,
  StateHolderWrapper,
  Tabs,
} from "panther";
import { createSignal, onCleanup, onMount, Show } from "solid-js";
import { DatasetIcehUploadAttemptForm } from "~/components/instance_dataset_iceh_import";
import { serverActions } from "~/server_actions";
import { IndicatorsTab } from "./_indicators_tab";
import { DisaggregatorsTab } from "./_disaggregators_tab";
import { DataTab } from "./_data_tab";

type Props = {
  backToInstance: () => void;
  isGlobalAdmin: boolean;
};

export function InstanceDatasetIceh(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const detail = timQuery(async () => {
    return await serverActions.getDatasetIcehDetail({});
  }, t3({ en: "Loading ICEH data...", fr: "Chargement des données ICEH..." }));

  let pollingInterval: ReturnType<typeof setInterval> | undefined;

  onMount(() => {
    pollingInterval = setInterval(async () => {
      const state = detail.state();
      if (state.status === "ready" && state.data.uploadAttempt !== undefined) {
        await detail.silentFetch();
      }
    }, 5000);
  });

  onCleanup(() => {
    if (pollingInterval !== undefined) {
      clearInterval(pollingInterval);
    }
  });

  const newUploadAttempt = timActionButton(
    () => serverActions.createDatasetIcehUploadAttempt({}),
    detail.silentFetch,
    openUploadAttempt
  );

  async function openUploadAttempt() {
    await openEditor({
      element: DatasetIcehUploadAttemptForm,
      props: {
        silentFetch: detail.silentFetch,
      },
    });
  }

  const deleteAllData = timActionButton(
    () => serverActions.deleteDatasetIcehData({}),
    detail.silentFetch
  );

  return (
    <>
      <EditorWrapper />
      <FrameTop
        panelChildren={
          <div class="ui-pad flex items-center justify-between">
            <div class="flex items-center gap-4">
              <Button onClick={p.backToInstance} iconName="arrow-left">
                {t3({ en: "Back", fr: "Retour" })}
              </Button>
              <h2 class="font-700 text-lg">
                {t3({ en: "ICEH Equity Data", fr: "Données d'équité ICEH" })}
              </h2>
            </div>
            <div class="ui-gap-sm flex items-center">
              <Button iconName="refresh" onClick={detail.fetch} />
            </div>
          </div>
        }
      >
        <StateHolderWrapper state={detail.state()}>
          {(data) => (
            <div class="ui-pad">
              <Show
                when={data.uploadAttempt}
                fallback={
                  <DataViewContent
                    data={data}
                    onStartImport={() => newUploadAttempt.click()}
                    onDeleteAll={() => deleteAllData.click()}
                    isGlobalAdmin={p.isGlobalAdmin}
                    newUploadAttemptState={newUploadAttempt.state()}
                  />
                }
              >
                {(ua) => (
                  <div class="rounded border p-4">
                    <h3 class="font-700 mb-2">
                      {t3({ en: "Import in progress", fr: "Importation en cours" })}
                    </h3>
                    <p class="text-neutral mb-4">
                      {t3({
                        en: `Status: ${ua().status.status}`,
                        fr: `Statut : ${ua().status.status}`,
                      })}
                    </p>
                    <Button onClick={openUploadAttempt} intent="primary">
                      {t3({ en: "View import", fr: "Voir l'importation" })}
                    </Button>
                  </div>
                )}
              </Show>
            </div>
          )}
        </StateHolderWrapper>
      </FrameTop>
    </>
  );
}

function DataViewContent(p: {
  data: IcehDataDetail;
  onStartImport: () => void;
  onDeleteAll: () => void;
  isGlobalAdmin: boolean;
  newUploadAttemptState: any;
}) {
  const [activeTab, setActiveTab] = createSignal<"summary" | "indicators" | "disaggregators">("summary");

  const hasData = p.data.dataRows > 0;

  return (
    <div>
      <div class="mb-6 flex items-center justify-between">
        <div>
          <Show
            when={hasData}
            fallback={
              <p class="text-neutral">
                {t3({
                  en: "No ICEH data imported yet.",
                  fr: "Aucune donnée ICEH importée.",
                })}
              </p>
            }
          >
            <p class="text-sm">
              <strong>{p.data.indicators}</strong>{" "}
              {t3({ en: "indicators", fr: "indicateurs" })},{" "}
              <strong>{p.data.dataRows.toLocaleString()}</strong>{" "}
              {t3({ en: "data rows", fr: "lignes de données" })},{" "}
              <strong>{p.data.years.length}</strong>{" "}
              {t3({ en: "years", fr: "années" })}
            </p>
          </Show>
        </div>
        <div class="ui-gap-sm flex">
          <Button
            onClick={p.onStartImport}
            intent="primary"
            state={p.newUploadAttemptState}
            iconName="upload"
          >
            {hasData
              ? t3({ en: "Re-import data", fr: "Réimporter les données" })
              : t3({ en: "Import data", fr: "Importer les données" })}
          </Button>
          <Show when={hasData && p.isGlobalAdmin}>
            <Button onClick={p.onDeleteAll} intent="danger" iconName="trash">
              {t3({ en: "Delete all", fr: "Tout supprimer" })}
            </Button>
          </Show>
        </div>
      </div>

      <Show when={hasData}>
        <Tabs
          activeTab={activeTab()}
          setActiveTab={setActiveTab as (tab: string) => void}
          tabs={[
            { id: "summary", label: t3({ en: "Summary", fr: "Résumé" }) },
            { id: "indicators", label: t3({ en: "Indicators", fr: "Indicateurs" }) },
            { id: "disaggregators", label: t3({ en: "Disaggregators", fr: "Désagrégateurs" }) },
          ]}
        />

        <div class="mt-4">
          <Show when={activeTab() === "summary"}>
            <DataTab />
          </Show>
          <Show when={activeTab() === "indicators"}>
            <IndicatorsTab />
          </Show>
          <Show when={activeTab() === "disaggregators"}>
            <DisaggregatorsTab />
          </Show>
        </div>
      </Show>
    </div>
  );
}
