import { t3, TC, type ModuleId } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  timQuery,
} from "panther";
import { For } from "solid-js";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions/config";

export function ViewFiles(
  p: EditorComponentProps<
    {
      projectId: string;
      moduleId: ModuleId;
      moduleLabel: string;
      resultsObjectIds: string[];
    },
    undefined
  >,
) {
  // const rLogs = useRLogs();

  const rLogs = timQuery(
    () =>
      serverActions.getLogs({ module_id: p.moduleId, projectId: p.projectId }),
    t3({ en: "Loading file listing...", fr: "Chargement de la liste des fichiers..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${t3({ en: "Files for", fr: "Fichiers pour" })} ${p.moduleLabel}`}>
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
      <div class="ui-spy-sm ui-pad">
        <For each={p.resultsObjectIds}>
          {(ro) => {
            return (
              <div class="cursor-pointer hover:underline">
                <Button
                  iconName="download"
                  href={`${_SERVER_HOST}/${p.projectId}/${p.moduleId}/${ro}?t=${Date.now()}`}
                  outline
                  download={ro}
                >
                  {ro}
                </Button>
              </div>
            );
          }}
        </For>
      </div>
    </FrameTop>
  );
}
