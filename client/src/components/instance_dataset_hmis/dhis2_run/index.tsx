import { t3, type DatasetHmisImportRunSummary, type Dhis2RunPair } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeaderBarCanGoBack,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { Match, Show, Switch, onCleanup, onMount } from "solid-js";
import { serverActions } from "~/server_actions";
import { Dhis2RunHistory } from "./_run_history";
import { Dhis2RunLauncher } from "./_launcher";
import { Dhis2RunView } from "./_run_view";

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

export function DatasetHmisDhis2Runs(p: Props) {
  const runs = createQuery(
    () => serverActions.getDatasetHmisImportRuns({}),
    t3({
      en: "Loading DHIS2 imports...",
      fr: "Chargement des importations DHIS2...",
      pt: "A carregar as importações DHIS2...",
    }),
  );

  // Per-pair progress lands on the run row as pairs complete — poll while a
  // run is in flight (the run row replaces the old status-JSON poll).
  let pollingIntervalId: ReturnType<typeof setInterval> | undefined;
  onMount(() => {
    pollingIntervalId = setInterval(async () => {
      const state = runs.state();
      if (
        state.status === "ready" &&
        state.data.some((r) => r.status === "running")
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
    await p.silentFetch();
  }

  function runningRun(
    items: DatasetHmisImportRunSummary[],
  ): DatasetHmisImportRunSummary | undefined {
    return items.find((r) => r.status === "running");
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
            <Button iconName="refresh" onClick={runs.fetch} />
          </div>
        </HeaderBarCanGoBack>
      }
    >
      <StateHolderWrapper state={runs.state()}>
        {(keyedRuns) => {
          return (
            <div class="ui-pad ui-spy h-full w-full overflow-auto">
              <Switch>
                <Match when={runningRun(keyedRuns)} keyed>
                  {(active) => (
                    <Dhis2RunView run={active} onChanged={refresh} />
                  )}
                </Match>
                <Match when={!runningRun(keyedRuns)}>
                  <Dhis2RunLauncher
                    lastUrl={keyedRuns.at(0)?.dhis2Url}
                    presetPairs={p.presetPairs}
                    presetLabel={p.presetLabel}
                    onLaunched={refresh}
                  />
                </Match>
              </Switch>
              <Show when={keyedRuns.length > 0}>
                <Dhis2RunHistory runs={keyedRuns} />
              </Show>
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
