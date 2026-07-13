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

export function ViewScript(
  p: EditorComponentProps<
    { projectId: string; runId: string; moduleId: ModuleId; moduleLabel: string },
    undefined
  >,
) {
  const rScript = createQuery(
    () =>
      serverActions.getScript({
        run_id: p.runId,
        module_id: p.moduleId,
        projectId: p.projectId,
      }),
    t3({ en: "Loading script...", fr: "Chargement du script...", pt: "A carregar o script..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${t3({ en: "Script for", fr: "Script pour", pt: "Script para" })} ${p.moduleLabel}`}>
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
      <StateHolderWrapper state={rScript.state()}>
        {(keyedScript) => {
          return (
            <div class="ui-pad whitespace-pre font-mono text-xs">
              {keyedScript.script}
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
