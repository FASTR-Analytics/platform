import { t3, TC, type ModuleId } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
} from "panther";
import { For, Show } from "solid-js";
import { formatBytes } from "./status";
import { serverActions } from "~/server_actions";
import { _SERVER_HOST } from "~/server_actions";

// Lists the actual files in the run's outputs/{moduleId} dir; downloads serve
// from the runs static mount at /{runId}/outputs/{moduleId}/{file}, which
// carries the same can_configure_data guard as this listing (Q-F/Q-G).
export function ViewFiles(
  p: EditorComponentProps<
    { runId: string; moduleId: ModuleId; moduleLabel: string },
    undefined
  >,
) {
  const rFiles = createQuery(
    () =>
      serverActions.listRunModuleFiles({
        run_id: p.runId,
        module_id: p.moduleId,
      }),
    t3({ en: "Loading file listing...", fr: "Chargement de la liste des fichiers...", pt: "A carregar a lista de ficheiros..." }),
  );

  return (
    <FrameTop
      panelChildren={
        <HeadingBar heading={`${t3({ en: "Files for", fr: "Fichiers pour", pt: "Ficheiros para" })} ${p.moduleLabel}`}>
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
      <StateHolderWrapper state={rFiles.state()}>
        {(keyedFiles) => (
          <div class="ui-spy-sm ui-pad">
            <Show
              when={keyedFiles.files.length > 0}
              fallback={
                <div class="text-base-content-muted">
                  {t3({
                    en: "No files in this results package for this module.",
                    fr: "Aucun fichier dans ce paquet de résultats pour ce module.",
                    pt: "Nenhum ficheiro neste pacote de resultados para este módulo.",
                  })}
                </div>
              }
            >
              <For each={keyedFiles.files}>
                {(file) => (
                  <div>
                    <Button
                      iconName="download"
                      href={`${_SERVER_HOST}/${p.runId}/outputs/${p.moduleId}/${file.name}?t=${Date.now()}`}
                      outline
                      download={file.name}
                    >
                      {`${file.name} (${formatBytes(file.sizeBytes)})`}
                    </Button>
                  </div>
                )}
              </For>
            </Show>
          </div>
        )}
      </StateHolderWrapper>
    </FrameTop>
  );
}
