import { t3, TC, type ModuleId } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { serverActions } from "~/server_actions";

export function ViewLogs(
  p: EditorComponentProps<
    { projectId: string; moduleId: ModuleId; moduleLabel: string },
    undefined
  >,
) {
  // const rLogs = useRLogs();

  const rLogs = createQuery(
    () =>
      serverActions.getLogs({ module_id: p.moduleId, projectId: p.projectId }),
    t3({ en: "Loading logs...", fr: "Chargement des journaux...", pt: "A carregar registos..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${t3({ en: "Logs for", fr: "Journaux pour", pt: "Registos de" })} ${p.moduleLabel}`}>
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
