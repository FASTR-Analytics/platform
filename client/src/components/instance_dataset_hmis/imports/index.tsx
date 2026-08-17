import {
  t3,
  type DatasetHmisImportLedgerItem,
  type DatasetHmisImportRunSummary,
  type DatasetHmisScheduledImport,
  type Dhis2RunPair,
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
  type StateHolder,
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
import { Dhis2ManageConnection } from "~/components/_shared/dhis2_credentials/manage_connection";
import { CsvRunDetail } from "./_csv_run_detail";
import { CsvWizard } from "./_csv_wizard";
import { ImportLedgerIndicatorDetail } from "./_ledger_indicator_detail";
import { Dhis2RunDetail } from "./_run_detail";
import { Dhis2TabByIndicator, type LedgerPeriodWindow } from "./_tab_by_indicator";
import { Dhis2TabCurrent } from "./_tab_current";
import { Dhis2TabFuture, visibleFutureSchedules } from "./_tab_future";
import { Dhis2TabHistory } from "./_tab_history";
import { Dhis2Wizard, type Dhis2WizardEntry } from "./_wizard";

type Props = EditorComponentProps<{}, undefined>;

type TabId = "current" | "future" | "history" | "by_indicator";

function runningRunOf(items: DatasetHmisImportRunSummary[]): DatasetHmisImportRunSummary | undefined {
  return items.find((r) => r.status === "running");
}

function queuedRunsOf(items: DatasetHmisImportRunSummary[]): DatasetHmisImportRunSummary[] {
  return items.filter((r) => r.status === "queued").sort((a, b) => a.id - b.id);
}

function needsReviewRunsOf(items: DatasetHmisImportRunSummary[]): DatasetHmisImportRunSummary[] {
  return items
    .filter((r) => r.status === "needs_review")
    .sort((a, b) => a.id - b.id);
}

function attentionSchedulesOf(schedules: DatasetHmisScheduledImport[]): DatasetHmisScheduledImport[] {
  return schedules.filter(
    (s) =>
      s.lastOutcome === "refused" ||
      s.lastOutcome === "missed" ||
      (s.lastOutcome === "launched" && s.lastRunStatus === "error"),
  );
}

function nextScheduleOf(schedules: DatasetHmisScheduledImport[]): DatasetHmisScheduledImport | undefined {
  const enabled = schedules.filter((s) => s.enabled);
  const oneShots = enabled
    .filter((s): s is DatasetHmisScheduledImport & { runAt: string } => s.kind === "one_shot" && s.runAt !== undefined)
    .sort((a, b) => a.runAt.localeCompare(b.runAt));
  return oneShots[0] ?? enabled.find((s) => s.kind === "recurring");
}

// The unified imports surface: a thin tab shell — Current / Future / History
// / By indicator — plus one wizard per source (DHIS2 runs, CSV file runs).
// The shell owns all data plumbing (the runs, scheduling, ledger and
// indicator-label reads, the poll loop, the SSE wake-up effect) so a run
// keeps progressing even while the user sits on a different tab. Nothing
// under the two StateHolderWrappers may own a query: their ready branch is
// keyed on the data object, so every silent runs/scheduling fetch (the 2 s
// poll included) remounts the tab area.
export function DatasetHmisImports(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const runs = createQuery(
    () => serverActions.getDatasetHmisImportRuns({}),
    t3({ en: "Loading DHIS2 imports...", fr: "Chargement des importations DHIS2...", pt: "A carregar as importações DHIS2..." }),
  );
  const scheduling = createQuery(
    () => serverActions.getDatasetHmisDhis2Scheduling({}),
    t3({ en: "Loading DHIS2 imports...", fr: "Chargement des importations DHIS2...", pt: "A carregar as importações DHIS2..." }),
  );

  const [tab, setTab] = createSignal<TabId>("current");

  // The ledger is a full-table read (one row per indicator × month), so it is
  // fetched only while the By-indicator tab is showing: on every switch to it
  // and on every refresh() while it is showing. Stale rows stay visible until
  // the fresh ones arrive (no loading flash on refetch).
  const [ledger, setLedger] = createSignal<StateHolder<DatasetHmisImportLedgerItem[]>>({
    status: "loading",
    msg: t3({
      en: "Loading import status...",
      fr: "Chargement de l'état des importations...",
      pt: "A carregar o estado das importações...",
    }),
  });
  const [ledgerVersion, setLedgerVersion] = createSignal(0);
  createEffect(() => {
    ledgerVersion();
    const showing = tab() === "by_indicator";
    if (!showing) {
      return;
    }
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    async function load() {
      const res = await serverActions.getDatasetHmisImportLedger({});
      if (controller.signal.aborted) {
        return;
      }
      setLedger(
        res.success
          ? { status: "ready", data: res.data }
          : { status: "error", err: res.err },
      );
    }
    void load();
  });

  // Labels are a display-only enrichment for the ledger — degrade to blank
  // until ready rather than gating the table behind them.
  const indicators = createQuery(() => serverActions.getIndicators({}));
  const indicatorLabels = createMemo((): Map<string, string> => {
    const s = indicators.state();
    if (s.status !== "ready") {
      return new Map();
    }
    return new Map(
      s.data.rawIndicators.map((r) => [r.raw_indicator_id, r.raw_indicator_label]),
    );
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

  // The scheduler tick acts server-side while this page may sit idle — the
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
    setLedgerVersion((v) => v + 1);
  }

  async function openWizard(entry: Dhis2WizardEntry) {
    const res = await openComponent({
      element: Dhis2Wizard,
      props: { entry, runsQuery: runs, schedulingQuery: scheduling },
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
    if (run.source === "csv") {
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

  async function openIndicatorDetail(
    indicatorRawId: string,
    items: DatasetHmisImportLedgerItem[],
    periodWindow: LedgerPeriodWindow,
  ) {
    const pairs = await openEditor({
      element: ImportLedgerIndicatorDetail,
      props: { indicatorRawId, items, window: periodWindow },
    });
    if (pairs && pairs.length > 0) {
      await openWizard({
        kind: "presetPairs",
        pairs,
        label: `${t3({
          en: "Re-importing",
          fr: "Réimportation de",
          pt: "A reimportar",
        })} ${indicatorRawId}:`,
      });
    }
  }

  async function retryFailedPairs(pairs: Dhis2RunPair[]) {
    await openWizard({
      kind: "presetPairs",
      pairs,
      label: t3({
        en: "Retrying all failed pairs:",
        fr: "Nouvelle tentative pour toutes les paires en échec :",
        pt: "Nova tentativa para todos os pares falhados:",
      }),
    });
  }

  async function openManageConnection() {
    await openComponent({
      element: Dhis2ManageConnection,
      props: {},
    });
    await refresh();
  }

  // The wizard reads schedulingQuery.state() to seed its initial signals
  // (stored-connection toggle, credentials prefill) — the New-import button
  // waits for readiness so it never seeds from "not loaded yet".
  const schedulingReady = () => scheduling.state().status === "ready";

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
      { id: "history", label: t3({ en: "History", fr: "Historique", pt: "Histórico" }) },
      {
        id: "by_indicator",
        label: t3({ en: "By indicator", fr: "Par indicateur", pt: "Por indicador" }),
      },
    ];
  }

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
              <Button
                onClick={() => openWizard({ kind: "new" })}
                iconName="databaseImport"
                disabled={!schedulingReady()}
              >
                {t3({ en: "New DHIS2 import", fr: "Nouvelle importation DHIS2", pt: "Nova importação DHIS2" })}
              </Button>
              <Button onClick={openCsvWizard} iconName="upload" outline onBackground="base-200">
                {t3({ en: "Upload CSV file", fr: "Téléverser un fichier CSV", pt: "Carregar um ficheiro CSV" })}
              </Button>
              <Button
                onClick={openManageConnection}
                outline
                onBackground="base-200"
                iconName="settings"
                disabled={!schedulingReady()}
              >
                {t3({ en: "Manage connection", fr: "Gérer la connexion", pt: "Gerir ligação" })}
              </Button>
              <Button
                iconName="refresh"
                onClick={async () => {
                  await runs.fetch();
                  await scheduling.silentFetch();
                  setLedgerVersion((v) => v + 1);
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
                <div class="ui-pad ui-spy h-full w-full overflow-auto">
                  <Show when={attentionSchedulesOf(schedulingInfo.schedules).length > 0}>
                    <div class="border-danger bg-danger-subtle ui-pad ui-spy-sm rounded border">
                      <div class="font-700">
                        {t3({
                          en: "Scheduled import needs attention",
                          fr: "Une importation planifiée nécessite votre attention",
                          pt: "Uma importação agendada precisa de atenção",
                        })}
                      </div>
                      <For each={attentionSchedulesOf(schedulingInfo.schedules)}>
                        {(s) => (
                          <div class="text-sm">
                            <span class="font-700">
                              <Switch>
                                <Match when={s.lastOutcome === "missed"}>
                                  {t3({ en: "Missed", fr: "Manquée", pt: "Falhada" })}
                                </Match>
                                <Match when={s.lastOutcome === "refused"}>
                                  {t3({ en: "Refused", fr: "Refusée", pt: "Recusada" })}
                                </Match>
                                <Match when={true}>
                                  {t3({ en: "Run failed", fr: "Importation en échec", pt: "Importação falhou" })}
                                </Match>
                              </Switch>
                            </span>
                            {s.lastFiredAt ? ` (${new Date(s.lastFiredAt).toLocaleString()})` : ""}
                            {s.lastError ? ` — ${s.lastError}` : ""}
                          </div>
                        )}
                      </For>
                    </div>
                  </Show>

                  <TabsNavigation items={tabItems()} value={tab()} onChange={setTab} />

                  <Switch>
                    <Match when={tab() === "current"}>
                      <Dhis2TabCurrent
                        runningRun={runningRunOf(keyedRuns)}
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
                        onEdit={(schedule) => openWizard({ kind: "editSchedule", schedule })}
                        onChanged={refresh}
                      />
                    </Match>
                    <Match when={tab() === "history"}>
                      <Dhis2TabHistory
                        runs={keyedRuns.filter(
                          (r) =>
                            r.status !== "queued" && r.status !== "needs_review",
                        )}
                        onOpenRun={openRunDetail}
                      />
                    </Match>
                    <Match when={tab() === "by_indicator"}>
                      <Dhis2TabByIndicator
                        ledger={ledger()}
                        indicatorLabels={indicatorLabels()}
                        onOpenIndicator={openIndicatorDetail}
                        onRetryFailedPairs={retryFailedPairs}
                      />
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
