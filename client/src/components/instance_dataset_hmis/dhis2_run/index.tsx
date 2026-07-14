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
  createQuery,
} from "panther";
import {
  For,
  Match,
  Show,
  Switch,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2RunHistory } from "./_run_history";
import { Dhis2RunLauncher } from "./_launcher";
import { Dhis2RunView } from "./_run_view";
import { Dhis2QueuedRuns } from "./_queued";
import { Dhis2Schedules } from "./_schedules";
import { Dhis2StoredCredentials } from "./_stored_credentials";

type Props = EditorComponentProps<
  {
    silentFetch: () => Promise<void>;
    // When set, the launcher imports exactly these pairs (checklist actions:
    // "re-import this indicator" / "retry failed pairs") instead of showing
    // the indicator/period pickers.
    presetPairs?: Dhis2RunPair[];
    presetLabel?: string;
  },
  undefined
>;

// The unified imports surface (PLAN_DHIS2_IMPORTER §6.1 Phase 4): Running /
// Queued / Scheduled / History in one place — every current and future DHIS2
// import, reviewable and stoppable here.
export function DatasetHmisDhis2Runs(p: Props) {
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

  const [queueLauncherOpen, setQueueLauncherOpen] = createSignal<boolean>(false);

  // Per-pair progress lands on the run row as pairs complete — poll while a
  // run is in flight, and while items are queued (the ~60 s scheduler tick
  // can launch one at any moment).
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

  async function refresh() {
    await runs.silentFetch();
    await scheduling.silentFetch();
    await p.silentFetch();
  }

  function runningRun(
    items: DatasetHmisImportRunSummary[],
  ): DatasetHmisImportRunSummary | undefined {
    return items.find((r) => r.status === "running");
  }

  function queuedRuns(
    items: DatasetHmisImportRunSummary[],
  ): DatasetHmisImportRunSummary[] {
    return items.filter((r) => r.status === "queued").sort((a, b) => a.id - b.id);
  }

  function attentionSchedules(
    schedules: DatasetHmisScheduledImport[],
  ): DatasetHmisScheduledImport[] {
    return schedules.filter(
      (s) =>
        s.lastOutcome === "refused" ||
        s.lastOutcome === "missed" ||
        (s.lastOutcome === "launched" && s.lastRunStatus === "error"),
    );
  }

  return (
    <FrameTop
      panelChildren={
        <HeaderBarCanGoBack
          back={() => p.close(undefined)}
          heading={t3({
            en: "Import from DHIS2",
            fr: "Importation depuis DHIS2",
            pt: "Importação a partir do DHIS2",
          })}
        >
          <div class="ui-gap-sm flex flex-none items-center">
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
        {(keyedRuns) => {
          return (
            <div class="ui-pad ui-spy h-full w-full overflow-auto">
              <StateHolderWrapper state={scheduling.state()} noPad>
                {(schedulingInfo) => (
                  <div class="ui-spy">
                    <Show
                      when={attentionSchedules(schedulingInfo.schedules).length > 0}
                    >
                      <div class="border-danger bg-danger/10 ui-pad ui-spy-sm rounded border">
                        <div class="font-700">
                          {t3({
                            en: "Scheduled import needs attention",
                            fr: "Une importation planifiée nécessite votre attention",
                            pt: "Uma importação agendada precisa de atenção",
                          })}
                        </div>
                        <For each={attentionSchedules(schedulingInfo.schedules)}>
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

                    <Switch>
                      <Match when={runningRun(keyedRuns)} keyed>
                        {(active) => (
                          <div class="ui-spy">
                            <Dhis2RunView run={active} onChanged={refresh} />
                            <Switch>
                              <Match when={queueLauncherOpen()}>
                                <div class="border-base-300 ui-pad rounded border">
                                  <Dhis2RunLauncher
                                    lastUrl={keyedRuns.at(0)?.dhis2Url}
                                    presetPairs={p.presetPairs}
                                    presetLabel={p.presetLabel}
                                    storedCredentials={schedulingInfo.storedCredentials}
                                    mode="queue"
                                    onLaunched={async () => {
                                      setQueueLauncherOpen(false);
                                      await refresh();
                                    }}
                                  />
                                </div>
                              </Match>
                              <Match when={!queueLauncherOpen()}>
                                <div>
                                  <Button
                                    onClick={() => setQueueLauncherOpen(true)}
                                    outline
                                    iconName="plus"
                                  >
                                    {t3({
                                      en: "Queue another import",
                                      fr: "Mettre une autre importation en file d'attente",
                                      pt: "Colocar outra importação em fila",
                                    })}
                                  </Button>
                                </div>
                              </Match>
                            </Switch>
                          </div>
                        )}
                      </Match>
                      <Match when={!runningRun(keyedRuns)}>
                        <Dhis2RunLauncher
                          lastUrl={keyedRuns.at(0)?.dhis2Url}
                          presetPairs={p.presetPairs}
                          presetLabel={p.presetLabel}
                          storedCredentials={schedulingInfo.storedCredentials}
                          mode="run"
                          onLaunched={refresh}
                        />
                      </Match>
                    </Switch>

                    <Show when={queuedRuns(keyedRuns).length > 0}>
                      <Dhis2QueuedRuns
                        queuedRuns={queuedRuns(keyedRuns)}
                        onChanged={refresh}
                      />
                    </Show>

                    <Dhis2StoredCredentials
                      storedCredentials={schedulingInfo.storedCredentials}
                      encryptionKeyConfigured={schedulingInfo.encryptionKeyConfigured}
                      onChanged={refresh}
                    />

                    <Dhis2Schedules
                      schedules={schedulingInfo.schedules}
                      unattendedReady={schedulingInfo.unattendedReady}
                      hasStoredCredentials={
                        schedulingInfo.storedCredentials !== undefined
                      }
                      onChanged={refresh}
                    />
                  </div>
                )}
              </StateHolderWrapper>

              <Show
                when={keyedRuns.filter((r) => r.status !== "queued").length > 0}
              >
                <Dhis2RunHistory
                  runs={keyedRuns.filter((r) => r.status !== "queued")}
                />
              </Show>
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
