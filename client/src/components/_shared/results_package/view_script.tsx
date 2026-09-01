import { t3 } from "lib";
import {
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { serverActions } from "~/server_actions";

// The R script this results package generated for one module — package
// contents, read run-keyed wherever a package is explored (the catalogue, a
// project's tab): one route, one guard (`can_view_data`).
export function ViewScript(
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
  const rScript = createQuery(
    () =>
      serverActions.getRunModuleScript({
        run_id: p.runId,
        module_id: p.moduleId,
      }),
    t3({ en: "Loading script...", fr: "Chargement du script...", pt: "A carregar o script..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          onBack={() => p.close(undefined)}
          heading={`${t3({ en: "Script for", fr: "Script pour", pt: "Script para" })} ${p.moduleLabel}`}
        />
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
