import { t, t2, T, type ModuleId } from "lib";
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
    "Loading logs...",
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`Logs for ${p.moduleLabel}`}>
          <div class="ui-gap-sm flex">
            <Button
              onClick={() => p.close(undefined)}
              intent="neutral"
              iconName="x"
            >
              {t2(T.FRENCH_UI_STRINGS.done)}
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
