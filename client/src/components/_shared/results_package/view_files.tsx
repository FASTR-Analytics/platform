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
import type { PackageInternalsSource } from "./internals_source";

// Lists the actual files in the run's outputs/{moduleId} dir, with a download
// per file. Both the listing and the download come from the host surface's
// source, so each carries that surface's guard: the instance catalogue reads
// run-keyed routes plus the runs static mount (`can_configure_data`), while a
// project reads its own attached package and streams downloads through a
// path-scoped endpoint (`can_view_data`).
export function ViewFiles(
  p: EditorComponentProps<
    {
      source: PackageInternalsSource;
      moduleId: ModuleId;
      moduleLabel: string;
    },
    undefined
  >,
) {
  const rFiles = createQuery(
    () => p.source.listFiles(p.moduleId),
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
                      href={p.source.fileHref(p.moduleId, file.name)}
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
