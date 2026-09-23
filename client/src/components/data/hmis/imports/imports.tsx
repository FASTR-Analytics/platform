import {
  t3,
  type DatasetHmisImportRunSummary,
  type DatasetHmisScheduledImport,
  type HmisIndicator,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  TabsNavigation,
  createQuery,
  getEditorWrapper,
  openComponent,
  type ListItem,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { indicatorsByDataId } from "~/components/data/hmis/_shared/mod.ts";
import { CsvRunDetail } from "./csv_run_detail";
import { CsvWizard } from "./csv_wizard";
import { Dhis2RunDetail } from "./dhis2_run_detail";
import { Dhis2TabCurrent } from "./dhis2_tab_current";
import { Dhis2TabFuture, visibleFutureSchedules } from "./dhis2_tab_future";
import { Dhis2TabHistory } from "./dhis2_tab_history";
import { Dhis2Wizard, type Dhis2WizardEntry } from "./wizard/mod.ts";

type Props = EditorComponentProps<{}, undefined>;

type TabId = "current" | "future" | "history";

function runningRunOf(
  items: DatasetHmisImportRunSummary[],
): DatasetHmisImportRunSummary | undefined {
  return items.find((r) => r.status === "running");
}

function queuedRunsOf(
  items: DatasetHmisImportRunSummary[],
): DatasetHmisImportRunSummary[] {
  return items.filter((r) => r.status === "queued").sort((a, b) => a.id - b.id);
}

function needsReviewRunsOf(
  items: DatasetHmisImportRunSummary[],
): DatasetHmisImportRunSummary[] {
  return items
    .filter((r) => r.status === "needs_review")
    .sort((a, b) => a.id - b.id);
}

function attentionSchedulesOf(
  schedules: DatasetHmisScheduledImport[],
): DatasetHmisScheduledImport[] {
  return schedules.filter(
    (s) =>
      s.lastOutcome === "refused" ||
      s.lastOutcome === "missed" ||
      (s.lastOutcome === "launched" && s.lastRunStatus === "error"),
  );
}

function nextScheduleOf(
  schedules: DatasetHmisScheduledImport[],
): DatasetHmisScheduledImport | undefined {
  const enabled = schedules.filter((s) => s.enabled);
  const oneShots = enabled
    .filter(
      (s): s is DatasetHmisScheduledImport & { runAt: string } =>
        s.kind === "one_shot" && s.runAt !== undefined,
    )
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
  return oneShots[0] ?? enabled.find((s) => s.kind === "recurring");
}

// The unified imports surface: a thin tab shell (Current / Future / History)
// plus one wizard per import kind (DHIS2 runs, CSV file runs). The ledger
// view is the HMIS Data page's Ledger tab (PLAN_A8).
// The shell owns all data plumbing (the runs, scheduling and
// indicator-label reads, the poll loop, the SSE wake-up effect) so a run
// keeps progressing even while the user sits on a different tab. Nothing
// under the two StateHolderWrappers may own a query: their ready branch is
// keyed on the data object, so every silent runs/scheduling fetch (the 2 s
// poll included) remounts the tab area.
export function DatasetHmisImports(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const runs = createQuery(
    () => serverActions.getDatasetHmisImportRuns({}),
    t3({
      en: "Loading DHIS2 imports...",
      fr: "Chargement des importations DHIS2...",
      pt: "A carregar as importações DHIS2...",
    }),
  );
  const scheduling = createQuery(
    () => serverActions.getDatasetHmisDhis2Scheduling({}),
    t3({
      en: "Loading DHIS2 imports...",
      fr: "Chargement des importations DHIS2...",
      pt: "A carregar as importações DHIS2...",
    }),
  );

  const [tab, setTab] = createSignal<TabId>("current");

  // The dictionary keyed by data id labels the run progress and the run
  // detail, whose rows carry data ids (PLAN_A5 ruling 9). A
  // display-only enrichment: blank until ready rather than gating the
  // tables behind it.
  const indicators = createQuery(() => serverActions.getIndicators({}));
  const byDataId = createMemo((): Map<string, HmisIndicator> => {
    const s = indicators.state();
    return s.status !== "ready"
      ? new Map()
      : indicatorsByDataId(s.data.indicators);
  });

  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    pollingIntervalId = setInterval(async () => {
      const state = runs.state();
      if (
        state.status === "ready" &&
        state.data.some((r) => r.status === "running" || r.status === "queued")
      ) {
        await runs.silentFetch();
      }
    }, 2000);
  });
  onCleanup(() => {
    if (pollingIntervalId !== undefined) {
      clearInterval(pollingIntervalId);
    }
  });

  // The scheduler tick acts server-side while this page may sit idle: the
  // SSE-pushed summary fields are the wake-up signal (review finding 6).
  createEffect(
    on(
      () => [
        instanceState.hmisImportRunActive,
        instanceState.hmisImportRunsQueued,
        instanceState.hmisScheduledImportAttention,
      ],
      async () => {
        await refresh();
      },
      { defer: true },
    ),
  );

  async function refresh() {
    await runs.silentFetch();
    await scheduling.silentFetch();
  }

  async function openWizard(entry: Dhis2WizardEntry) {
    const res = await openComponent({
      element: Dhis2Wizard,
      props: { entry },
    });
    if (res) {
      setTab(res.landedTab);
      await refresh();
    }
  }

  async function openCsvWizard() {
    const res = await openComponent({
      element: CsvWizard,
      props: { runsQuery: runs },
    });
    if (res) {
      setTab(res.landedTab);
      await refresh();
    }
  }

  async function openRunDetail(run: DatasetHmisImportRunSummary) {
    if (run.route === "csv") {
      await openEditor({ element: CsvRunDetail, props: { run } });
      return;
    }
    const retryPairs = await openEditor({
      element: Dhis2RunDetail,
      props: { run },
    });
    if (retryPairs && retryPairs.length > 0) {
      await openWizard({
        kind: "presetPairs",
        pairs: retryPairs,
        label: t3({
          en: "Retrying this run's failed pairs:",
          fr: "Nouvelle tentative pour les paires en échec de cette importation :",
          pt: "Nova tentativa para os pares falhados desta importação:",
        }),
      });
    }
  }

  function tabItems(): ListItem<TabId>[] {
    const runsState = runs.state();
    const schedulingState = scheduling.state();
    const currentCount =
      runsState.status === "ready"
        ? runsState.data.filter(
            (r) =>
              r.status === "running" ||
              r.status === "queued" ||
              r.status === "needs_review",
          ).length
        : 0;
    const futureCount =
      schedulingState.status === "ready"
        ? visibleFutureSchedules(schedulingState.data.schedules).length
        : 0;
    return [
      {
        id: "current",
        label: t3({ en: "Current", fr: "En cours", pt: "Atual" }),
        badge: currentCount > 0 ? currentCount : undefined,
      },
      {
        id: "future",
        label: t3({ en: "Future", fr: "À venir", pt: "Futuro" }),
        badge: futureCount > 0 ? futureCount : undefined,
      },
      {
        id: "history",
        label: t3({ en: "History", fr: "Historique", pt: "Histórico" }),
      },
    ];
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            onBack={() => p.close(undefined)}
            heading={t3({
              en: "Imports",
              fr: "Importations",
              pt: "Importações",
            })}
          >
            <div class="ui-gap-sm flex flex-none items-center">
              <Button
                onClick={() => openWizard({ kind: "new" })}
                iconName="databaseImport"
              >
                {t3({
                  en: "New DHIS2 import",
                  fr: "Nouvelle importation DHIS2",
                  pt: "Nova importação DHIS2",
                })}
              </Button>
              <Button onClick={openCsvWizard} iconName="upload" outline>
                {t3({
                  en: "Upload CSV file",
                  fr: "Téléverser un fichier CSV",
                  pt: "Carregar um ficheiro CSV",
                })}
              </Button>
              <Button
                iconName="refresh"
                onClick={async () => {
                  await runs.fetch();
                  await scheduling.silentFetch();
                }}
              />
            </div>
          </HeadingBar>
        }
      >
        <StateHolderWrapper state={runs.state()}>
          {(keyedRuns) => (
            <StateHolderWrapper state={scheduling.state()} noPad>
              {(schedulingInfo) => (
                <div class="ui-pad ui-spy flex h-full w-full flex-col overflow-auto">
                  <Show
                    when={
                      attentionSchedulesOf(schedulingInfo.schedules).length > 0
                    }
                  >
                    <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
                      <div class="font-700">
                        {t3({
                          en: "Scheduled import needs attention",
                          fr: "Une importation planifiée nécessite votre attention",
                          pt: "Uma importação agendada precisa de atenção",
                        })}
                      </div>
                      <For
                        each={attentionSchedulesOf(schedulingInfo.schedules)}
                      >
                        {(s) => (
                          <div class="text-sm">
                            <span class="font-700">
                              <Switch>
                                <Match when={s.lastOutcome === "missed"}>
                                  {t3({
                                    en: "Missed",
                                    fr: "Manquée",
                                    pt: "Falhada",
                                  })}
                                </Match>
                                <Match when={s.lastOutcome === "refused"}>
                                  {t3({
                                    en: "Refused",
                                    fr: "Refusée",
                                    pt: "Recusada",
                                  })}
                                </Match>
                                <Match when={true}>
                                  {t3({
                                    en: "Run failed",
                                    fr: "Importation en échec",
                                    pt: "Importação falhou",
                                  })}
                                </Match>
                              </Switch>
                            </span>
                            {s.lastFiredAt
                              ? ` (${new Date(s.lastFiredAt).toLocaleString()})`
                              : ""}
                            {s.lastError ? ` — ${s.lastError}` : ""}
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <TabsNavigation
                    noPad
                    // size="sm"
                    items={tabItems()}
                    value={tab()}
                    onChange={setTab}
                  />

                  <Switch>
                    <Match when={tab() === "current"}>
                      <Dhis2TabCurrent
                        runningRun={runningRunOf(keyedRuns)}
                        indicatorsByDataId={byDataId()}
                        queuedRuns={queuedRunsOf(keyedRuns)}
                        needsReviewRuns={needsReviewRunsOf(keyedRuns)}
                        nextSchedule={nextScheduleOf(schedulingInfo.schedules)}
                        onNewImport={() => openWizard({ kind: "new" })}
                        onChanged={refresh}
                      />
                    </Match>
                    <Match when={tab() === "future"}>
                      <Dhis2TabFuture
                        schedules={schedulingInfo.schedules}
                        onEdit={(schedule) =>
                          openWizard({ kind: "editSchedule", schedule })
                        }
                        onChanged={refresh}
                      />
                    </Match>
                    <Match when={tab() === "history"}>
                      <div class="min-h-0 flex-1">
                        <Dhis2TabHistory
                          runs={keyedRuns.filter(
                            (r) =>
                              r.status !== "queued" &&
                              r.status !== "needs_review",
                          )}
                          onOpenRun={openRunDetail}
                        />
                      </div>
                    </Match>
                  </Switch>
                </div>
              )}
            </StateHolderWrapper>
          )}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
