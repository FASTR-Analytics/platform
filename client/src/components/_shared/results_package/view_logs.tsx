import { t3, TC, type ModuleId } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import type { PackageInternalsSource } from "./internals_source";

// One module's execution log from this results package — package contents,
// so the same viewer serves both surfaces (PLAN_RESULTS_RUNS item 3b), each
// through its own route via the host's source.
export function ViewLogs(
  p: EditorComponentProps<
    {
      source: PackageInternalsSource;
      moduleId: ModuleId;
      moduleLabel: string;
    },
    undefined
  >,
) {
  const rLogs = createQuery(
    () => p.source.getLogs(p.moduleId),
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
