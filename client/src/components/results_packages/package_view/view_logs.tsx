import { t3 } from "lib";
import {
  type AlertComponentProps,
  Button,
  createQuery,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  ModalContainer,
  StateHolderWrapper,
} from "panther";
import { createEffect, createSignal, on } from "solid-js";
import { serverActions } from "~/server_actions";

// One module's execution log from this results package: package contents,
// read run-keyed wherever a package is explored: one route, one guard
// (`can_view_logs`).
export function ViewLogs(
  p: EditorComponentProps<
    {
      runId: string;
      // Read plane: a manifest module id, as text; `ModuleId` is a
      // generation-plane type.
      moduleId: string;
      moduleLabel: string;
    },
    undefined
  >,
) {
  const rLogs = createQuery(
    () =>
      serverActions.getRunModuleLogs({
        run_id: p.runId,
        module_id: p.moduleId,
      }),
    t3({
      en: "Loading logs...",
      fr: "Chargement des journaux...",
      pt: "A carregar registos...",
    }),
  );

  return (
    <FrameTop
      pad="md"
      panelChildren={
        <HeadingBar
          tonal
          onBack={() => p.close(undefined)}
          heading={`${
            t3({ en: "Logs for", fr: "Journaux pour", pt: "Registos de" })
          } ${p.moduleLabel}`}
        />
      }
    >
      <StateHolderWrapper state={rLogs.state()}>
        {(keyedLogs) => {
          return (
            <div class="font-mono text-xs whitespace-pre">
              {keyedLogs.logs}
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}

// The same log in a modal, opened from a module chip in the status bar. A
// generating run's log is read live from its workspace (readRunModuleLogs),
// so Refresh re-reads it in place, keeping the old text up until the new one
// lands, and each load scrolls to the newest line.
export function ModuleLogsModal(
  p: AlertComponentProps<
    { runId: string; moduleId: string; moduleLabel: string },
    undefined
  >,
) {
  const rLogs = createQuery(
    () =>
      serverActions.getRunModuleLogs({
        run_id: p.runId,
        module_id: p.moduleId,
      }),
    t3({
      en: "Loading logs...",
      fr: "Chargement des journaux...",
      pt: "A carregar registos...",
    }),
  );
  const [refreshing, setRefreshing] = createSignal(false);
  let end: HTMLDivElement | undefined;

  async function refresh() {
    setRefreshing(true);
    await rLogs.silentFetch();
    setRefreshing(false);
  }

  createEffect(
    on(rLogs.state, (state) => {
      if (state.status === "ready") {
        queueMicrotask(() => end?.scrollIntoView({ block: "end" }));
      }
    }),
  );

  return (
    <ModalContainer
      width="4xl"
      height="lg"
      title={`${
        t3({ en: "Logs for", fr: "Journaux pour", pt: "Registos de" })
      } ${p.moduleLabel}`}
      onClose={{ kind: "close", onClick: () => p.close(undefined) }}
      footer={
        <Button
          outline
          iconName="refresh"
          loading={refreshing()}
          onClick={refresh}
        >
          {t3({ en: "Refresh", fr: "Actualiser", pt: "Atualizar" })}
        </Button>
      }
    >
      <StateHolderWrapper state={rLogs.state()}>
        {(keyedLogs) => (
          <div class="font-mono text-xs whitespace-pre">
            {keyedLogs.logs}
            <div ref={end} />
          </div>
        )}
      </StateHolderWrapper>
    </ModalContainer>
  );
}
