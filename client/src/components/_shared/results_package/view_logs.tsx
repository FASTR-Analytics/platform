import { t3 } from "lib";
import {
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { serverActions } from "~/server_actions";

// One module's execution log from this results package — package contents,
// read run-keyed wherever a package is explored: one route, one guard
// (`can_view_logs`).
export function ViewLogs(
  p: EditorComponentProps<
    {
      runId: string;
      // Read plane: a manifest module id, as text (PLAN_1a §0 clause 3).
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
    t3({ en: "Loading logs...", fr: "Chargement des journaux...", pt: "A carregar registos..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          onBack={() => p.close(undefined)}
          heading={`${t3({ en: "Logs for", fr: "Journaux pour", pt: "Registos de" })} ${p.moduleLabel}`}
        />
      }
    >
      <StateHolderWrapper state={rLogs.state()}>
        {(keyedLogs) => {
          return (
            <div class="ui-pad whitespace-pre font-mono text-xs">
              {keyedLogs.logs}
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
