import { t3, type IcehImportRunSummary } from "lib";
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
import { For, Show, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { IcehNeedsReviewCard } from "./_needs_review_card";
import { IcehRunDetail } from "./_run_detail";
import { IcehRunView } from "./_run_view";
import { icehRunStatusLabel } from "./_status_label";
import { IcehWizard } from "./_wizard";

type Props = EditorComponentProps<{}, undefined>;

// The ICEH imports surface: a Current card (running progress / needs_review
// hold) plus a History table — ICEH's first-ever durable import history.
// Deliberately smaller than the HMIS machine — no queue, no schedules, so no
// tabs and no Future (PLAN_DHIS2_IMPORTER_CONSOLIDATION §2, "asymmetry by
// design").
export function DatasetIcehImports(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const runs = createQuery(
    () => serverActions.getDatasetIcehImportRuns({}),
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
    const res = await openComponent({ element: IcehWizard, props: {} });
    if (res) {
      await refresh();
    }
  }

  const columns: TableColumn<IcehImportRunSummary>[] = [
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
      key: "zipFileName",
      header: t3({ en: "File", fr: "Fichier", pt: "Ficheiro" }),
      render: (run) => run.zipFileName,
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
          {icehRunStatusLabel(run.status)}
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
                {(run) => <IcehNeedsReviewCard run={run} onChanged={refresh} />}
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
                    <IcehRunView run={run} onChanged={refresh} />
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
                    void openEditor({ element: IcehRunDetail, props: { run } })
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
