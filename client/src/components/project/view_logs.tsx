import { t3, TC, type ModuleId } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { serverActions } from "~/server_actions";

export function ViewLogs(
  p: EditorComponentProps<
    { projectId: string; moduleId: ModuleId; moduleLabel: string },
    undefined
  >,
) {
  // const rLogs = useRLogs();

  const rLogs = timQuery(
    () =>
      serverActions.getLogs({ module_id: p.moduleId, projectId: p.projectId }),
    t3({ en: "Loading logs...", fr: "Chargement des journaux..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${t3({ en: "Logs for", fr: "Journaux pour" })} ${p.moduleLabel}`}>
          <div class="ui-gap-sm flex">
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t3(TC.done)}
            </Button>
          </div>
        </HeadingBar>
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
