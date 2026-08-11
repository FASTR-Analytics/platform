import { t3, type HfaImportRunSummary } from "lib";
import {
  Button,
  CollapsibleSection,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  Table,
  createQuery,
  getEditorWrapper,
  openComponent,
  toNum0,
  type TableColumn,
} from "panther";
import { For, Show, createEffect, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { HfaNeedsReviewCard } from "./_needs_review_card";
import { HfaRunDetail } from "./_run_detail";
import { HfaRunView } from "./_run_view";
import { hfaRunStatusLabel } from "./_status_label";
import { HfaWizard } from "./_wizard";

type Props = EditorComponentProps<
  {
    // The sidebar's "Start new import" button opens this surface with the
    // wizard already open.
    autoOpenWizard?: boolean;
  },
  undefined
>;

// The HFA imports surface: a Current card (running progress / needs_review
// hold) plus a History table. Deliberately smaller than the HMIS machine —
// no queue, no schedules, so no tabs and no Future
// (PLAN_DHIS2_IMPORTER_CONSOLIDATION §2, "asymmetry by design").
export function DatasetHfaImports(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const runs = createQuery(
    () => serverActions.getDatasetHfaImportRuns({}),
    t3({
      en: "Loading imports...",
      fr: "Chargement des importations...",
      pt: "A carregar as importações...",
    }),
  );

  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    pollingIntervalId = setInterval(async () => {
      const state = runs.state();
      if (state.status === "ready" && state.data.some((r) => r.status === "running")) {
        await runs.silentFetch();
      }
    }, 2000);
  });
  onCleanup(() => {
    if (pollingIntervalId !== undefined) {
      clearInterval(pollingIntervalId);
    }
  });

  async function refresh() {
    await runs.silentFetch();
  }

  async function openWizard() {
    const res = await openComponent({ element: HfaWizard, props: {} });
    if (res) {
      await refresh();
    }
  }

  let autoOpened = false;
  createEffect(() => {
    const ready = runs.state().status === "ready";
    if (autoOpened || !ready || !p.autoOpenWizard) return;
    autoOpened = true;
    void openWizard();
  });

  const columns: TableColumn<HfaImportRunSummary>[] = [
    {
      key: "startedAt",
      header: t3({ en: "Started", fr: "Démarrée", pt: "Iniciada" }),
      sortable: true,
      render: (run) => new Date(run.startedAt).toLocaleString(),
    },
    {
      key: "triggeredBy",
      header: t3({ en: "By", fr: "Par", pt: "Por" }),
      sortable: true,
      render: (run) => run.triggeredBy ?? "",
    },
    {
      key: "timePoint",
      header: t3({ en: "Time point", fr: "Point temporel", pt: "Ponto temporal" }),
      sortable: true,
      render: (run) => run.timePoint,
    },
    {
      key: "csvFileName",
      header: t3({ en: "File", fr: "Fichier", pt: "Ficheiro" }),
      render: (run) => run.csvFileName,
    },
    {
      key: "nRowsIntegrated",
      header: t3({ en: "Values imported", fr: "Valeurs importées", pt: "Valores importados" }),
      alignH: "right",
      render: (run) =>
        run.nRowsIntegrated !== undefined ? toNum0(run.nRowsIntegrated) : "",
    },
    {
      key: "status",
      header: t3({ en: "Status", fr: "Statut", pt: "Estado" }),
      sortable: true,
      render: (run) => (
        <span class={run.status === "error" ? "text-danger font-700" : ""}>
          {hfaRunStatusLabel(run.status)}
        </span>
      ),
    },
  ];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={() => p.close(undefined)}
            heading={t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
          >
            <div class="ui-gap-sm flex flex-none items-center">
              <Button onClick={openWizard} iconName="upload">
                {t3({ en: "New import", fr: "Nouvelle importation", pt: "Nova importação" })}
              </Button>
              <Button iconName="refresh" onClick={() => runs.fetch()} />
            </div>
          </HeadingBar>
        }
      >
        <StateHolderWrapper state={runs.state()}>
          {(keyedRuns) => (
            <div class="ui-pad ui-spy h-full w-full overflow-auto">
              <For each={keyedRuns.filter((r) => r.status === "needs_review")}>
                {(run) => <HfaNeedsReviewCard run={run} onChanged={refresh} />}
              </For>

              <Show
                when={keyedRuns.find((r) => r.status === "running")}
                fallback={
                  <div class="ui-pad ui-spy-sm rounded border">
                    <div class="text-sm">
                      {t3({
                        en: "No import running.",
                        fr: "Aucune importation en cours.",
                        pt: "Nenhuma importação em curso.",
                      })}
                    </div>
                    <Show when={instanceState.hfaTimePoints.length === 0}>
                      <div class="text-sm">
                        {t3({
                          en: "Create a time point on the time points page before importing data.",
                          fr: "Créez un point temporel sur la page des points temporels avant d'importer des données.",
                          pt: "Crie um ponto temporal na página dos pontos temporais antes de importar dados.",
                        })}
                      </div>
                    </Show>
                    <Button onClick={openWizard} iconName="upload">
                      {t3({ en: "New import", fr: "Nouvelle importation", pt: "Nova importação" })}
                    </Button>
                  </div>
                }
                keyed
              >
                {(run) => (
                  <CollapsibleSection
                    defaultOpen
                    boldHeader
                    title={t3({
                      en: "Import in progress",
                      fr: "Importation en cours",
                      pt: "Importação em curso",
                    })}
                  >
                    <HfaRunView run={run} onChanged={refresh} />
                  </CollapsibleSection>
                )}
              </Show>

              <div class="ui-spy-sm">
                <div class="font-700 text-lg">
                  {t3({ en: "History", fr: "Historique", pt: "Histórico" })}
                </div>
                <Table
                  data={keyedRuns.filter((r) => r.status !== "needs_review")}
                  columns={columns}
                  keyField="id"
                  onRowClick={(run) =>
                    void openEditor({ element: HfaRunDetail, props: { run } })
                  }
                  noRowsMessage={t3({
                    en: "No imports yet",
                    fr: "Aucune importation pour le moment",
                    pt: "Ainda não há importações",
                  })}
                />
              </div>
            </div>
          )}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
