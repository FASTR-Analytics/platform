import {
  t3,
  type DatasetHmisImportRunSummary,
  type DatasetHmisScheduledImport,
  type Dhis2RunPair,
} from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  TabsNavigation,
  createQuery,
  openComponent,
  type ListItem,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createSignal,
  on,
  onCleanup,
  onMount,
} from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { Dhis2ManageConnection } from "./_manage_connection";
import { Dhis2TabCurrent } from "./_tab_current";
import { Dhis2TabFuture, visibleFutureSchedules } from "./_tab_future";
import { Dhis2TabHistory } from "./_tab_history";
import { Dhis2Wizard, type Dhis2WizardEntry } from "./_wizard";

type Props = EditorComponentProps<
  {
    silentFetch: () => Promise<void>;
    // Checklist actions ("re-import this indicator" / "retry failed pairs")
    // pass a fixed pair list — the listing auto-opens the reduced-step
    // wizard for it on mount (PLAN_DHIS2_IMPORTER_UI_REVISION §3).
    presetPairs?: Dhis2RunPair[];
    presetLabel?: string;
  },
  undefined
>;

type TabId = "current" | "future" | "history";

function runningRunOf(items: DatasetHmisImportRunSummary[]): DatasetHmisImportRunSummary | undefined {
  return items.find((r) => r.status === "running");
}

function queuedRunsOf(items: DatasetHmisImportRunSummary[]): DatasetHmisImportRunSummary[] {
  return items.filter((r) => r.status === "queued").sort((a, b) => a.id - b.id);
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

// The unified imports surface (PLAN_DHIS2_IMPORTER_UI_REVISION): a thin tab
// shell — Current / Future / History — plus the one wizard for every way an
// import gets configured. The shell owns all data plumbing (both queries,
// the poll loop, the SSE wake-up effect) so a run keeps progressing even
// while the user sits on a different tab.
export function DatasetHmisDhis2Runs(p: Props) {
  const runs = createQuery(
    () => serverActions.getDatasetHmisImportRuns({}),
    t3({ en: "Loading DHIS2 imports...", fr: "Chargement des importations DHIS2...", pt: "A carregar as importações DHIS2..." }),
  );
  const scheduling = createQuery(
    () => serverActions.getDatasetHmisDhis2Scheduling({}),
    t3({ en: "Loading DHIS2 imports...", fr: "Chargement des importations DHIS2...", pt: "A carregar as importações DHIS2..." }),
  );

  const [tab, setTab] = createSignal<TabId>("current");

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
        await runs.silentFetch();
        await scheduling.silentFetch();
      },
      { defer: true },
    ),
  );

  async function refresh() {
    await runs.silentFetch();
    await scheduling.silentFetch();
    await p.silentFetch();
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

  async function openManageConnection() {
    await openComponent({
      element: Dhis2ManageConnection,
      props: { schedulingQuery: scheduling },
    });
    await refresh();
  }

  // The wizard reads schedulingQuery.state() to seed its initial signals
  // (stored-connection toggle, credentials prefill) — opening it before that
  // query resolves would seed those from "not loaded yet", not "nothing
  // stored". createQuery starts in "loading" and fetches asynchronously, so
  // this must wait for readiness rather than firing from onMount.
  const schedulingReady = () => scheduling.state().status === "ready";

  let autoOpened = false;
  createEffect(() => {
    const ready = schedulingReady();
    const preset = p.presetPairs;
    if (autoOpened || !ready || !preset || preset.length === 0) return;
    autoOpened = true;
    void openWizard({ kind: "presetPairs", pairs: preset, label: p.presetLabel ?? "" });
  });

  function tabItems(): ListItem<TabId>[] {
    const runsState = runs.state();
    const schedulingState = scheduling.state();
    const currentCount =
      runsState.status === "ready"
        ? runsState.data.filter((r) => r.status === "running" || r.status === "queued").length
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
    ];
  }

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          back={() => p.close(undefined)}
          heading={t3({ en: "Import from DHIS2", fr: "Importation depuis DHIS2", pt: "Importação a partir do DHIS2" })}
        >
          <div class="ui-gap-sm flex flex-none items-center">
            <Button
              onClick={() => openWizard({ kind: "new" })}
              iconName="databaseImport"
              disabled={!schedulingReady()}
            >
              {t3({ en: "New import", fr: "Nouvelle importation", pt: "Nova importação" })}
            </Button>
            <Button
              onClick={openManageConnection}
              outline
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
              }}
            />
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper state={runs.state()}>
        {(keyedRuns) => (
          <StateHolderWrapper state={scheduling.state()} noPad>
            {(schedulingInfo) => (
              <div class="ui-pad ui-spy h-full w-full overflow-auto">
                <Show when={attentionSchedulesOf(schedulingInfo.schedules).length > 0}>
                  <div class="border-danger bg-danger/10 ui-pad ui-spy-sm rounded border">
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
                    <Dhis2TabHistory runs={keyedRuns.filter((r) => r.status !== "queued")} />
                  </Match>
                </Switch>
              </div>
            )}
          </StateHolderWrapper>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
