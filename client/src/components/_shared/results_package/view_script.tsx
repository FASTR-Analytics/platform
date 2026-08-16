import { t3, type ModuleId } from "lib";
import {
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import type { PackageInternalsSource } from "./internals_source";

// The R script this results package generated for one module — package
// contents, so the same viewer serves both the instance catalogue and a
// project's package tab (PLAN_RESULTS_RUNS item 3b). The route it reads
// through comes from the host surface's source, because the two surfaces have
// different permission models for the same bytes.
export function ViewScript(
  p: EditorComponentProps<
    {
      source: PackageInternalsSource;
      moduleId: ModuleId;
      moduleLabel: string;
    },
    undefined
  >,
) {
  const rScript = createQuery(
    () => p.source.getScript(p.moduleId),
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
