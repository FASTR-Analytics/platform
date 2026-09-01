import { t3 } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  HeadingBar,
  StateHolderWrapper,
  createQuery,
  formatFileSize,
} from "panther";
import { For, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { runOutputFileHref } from "./status";

// Lists the actual files in the run's outputs/{moduleId} dir, with a download
// per file. Used only for a FAILED run's started modules (the catalogue's
// failed branch — a partial workspace with no manifest); a ready run's files
// are listed inline by ResultsPackageView from the T2 detail. Listing and
// download share the guard of every package read (`can_view_data`).
export function ViewFiles(
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
        <HeadingBar
          onBack={() => p.close(undefined)}
          heading={`${t3({ en: "Files for", fr: "Fichiers pour", pt: "Ficheiros para" })} ${p.moduleLabel}`}
        />
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
                      href={runOutputFileHref(p.runId, p.moduleId, file.name)}
                      outline
                      download={file.name}
                    >
                      {`${file.name} (${formatFileSize(file.sizeBytes, 1)})`}
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
