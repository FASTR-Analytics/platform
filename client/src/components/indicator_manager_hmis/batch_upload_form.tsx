import type Uppy from "@uppy/core";
import { createSignal, onCleanup, onMount } from "solid-js";
import { INDICATOR_BATCH_FILE_COLUMNS, t3, TC } from "lib";
import { serverActions } from "~/server_actions";
import {
  Button,
  Select,
  StateHolderFormError,
  getSelectOptions,
  createFormAction,
  type EditorComponentProps,
  FrameTop,
  HeadingBar,
  Checkbox,
} from "panther";
import { cleanupUppy, createUppyInstance } from "~/components/_uppy_file_upload";
import { instanceState } from "~/state/instance/t1_store";

type Props = EditorComponentProps<{}, undefined>;

// One file for the whole dictionary (PLAN_A3 ruling 11); the manager's
// Download CSV writes the same columns.
export function BatchUploadForm(p: Props) {
  const [selectedFileName, setSelectedFileName] = createSignal<string>("");
  const [replaceAllExisting, setReplaceAllExisting] =
    createSignal<boolean>(false);

  function updateSelectedFileName(fileName: string) {
    setSelectedFileName(fileName);
  }

  const handleBatchUpload = createFormAction(
    async () => {
      const assetFileName = selectedFileName();

      if (!assetFileName) {
        return { success: false, err: t3({ en: "You must select a CSV file", fr: "Vous devez sélectionner un fichier CSV", pt: "Tem de selecionar um ficheiro CSV" }) };
      }

      return serverActions.batchUploadIndicators({
        asset_file_name: assetFileName,
        replace_all_existing: replaceAllExisting(),
      });
    },
    () => p.close(undefined),
  );

  let uppy: Uppy | undefined = undefined;

  onMount(() => {
    uppy = createUppyInstance({
      triggerId: "#select-csv-file-button",
      onUploadSuccess: (file) => {
        if (!file) {
          return;
        }
        updateSelectedFileName(file.name as string);
      },
    });
  });

  onCleanup(() => {
    cleanupUppy(uppy);
  });

  return (
    <FrameTop
      panelChildren={
        <HeadingBar
          tonal
          heading={t3({ en: "Batch import indicators", fr: "Importation groupée d'indicateurs", pt: "Importação em lote de indicadores" })}
          onBack={() => p.close(undefined)}
        />
      }
    >
      <div class="ui-pad ui-spy">
        <div class="text-sm ui-spy-sm">
          <div>
            {t3({ en: "Upload a CSV file with the following headers:", fr: "Téléversez un fichier CSV avec les en-têtes suivants :", pt: "Carregue um ficheiro CSV com os seguintes cabeçalhos:" })}
            <span class="font-700 ml-3 font-mono">
              {INDICATOR_BATCH_FILE_COLUMNS.join(", ")}
            </span>
          </div>
          <div class="text-xs">
            {t3({
              en: "type is base or derived. sources is semicolon-separated for a base indicator and empty for a derived one; expression is the derived indicator's formula and empty for a base. format_as is number, percent or rate_per_10k (a base is always number). thresholds is the conditional-formatting rule as JSON, or empty. Existing indicators keep their sort order. Sources named in the file keep their labels; a new source is labelled by its id until edited.",
              fr: "type vaut base ou derived. sources est une liste séparée par des points-virgules pour un indicateur de base et vide pour un indicateur dérivé ; expression est la formule de l'indicateur dérivé et vide pour un indicateur de base. format_as vaut number, percent ou rate_per_10k (un indicateur de base est toujours number). thresholds est la règle de mise en forme conditionnelle en JSON, ou vide. Les indicateurs existants conservent leur ordre. Les sources nommées dans le fichier conservent leur libellé ; une nouvelle source prend son identifiant comme libellé jusqu'à modification.",
              pt: "type é base ou derived. sources é uma lista separada por ponto e vírgula para um indicador de base e vazia para um derivado; expression é a fórmula do indicador derivado e vazia para um de base. format_as é number, percent ou rate_per_10k (um indicador de base é sempre number). thresholds é a regra de formatação condicional em JSON, ou vazio. Os indicadores existentes mantêm a sua ordem. As fontes nomeadas no ficheiro mantêm as suas etiquetas; uma fonte nova recebe o seu ID como etiqueta até ser editada.",
            })}
          </div>
        </div>

        <div class="">
          <Button id="select-csv-file-button" iconName="upload">
            {t3({ en: "Upload new CSV file", fr: "Téléverser un nouveau fichier CSV", pt: "Carregar um novo ficheiro CSV" })}
          </Button>
        </div>

        <div class="w-96">
          <Select
            label={t3({ en: "Or select existing CSV file", fr: "Ou sélectionner un fichier CSV existant", pt: "Ou selecionar um ficheiro CSV existente" })}
            placeholder={t3({ en: "Select a file...", fr: "Sélectionner un fichier...", pt: "Selecione um ficheiro..." })}
            options={getSelectOptions(
              instanceState.assets.filter((a) => a.isCsv).map((a) => a.fileName),
            )}
            value={selectedFileName()}
            onChange={updateSelectedFileName}
            fullWidth
          />
        </div>

        <div class="ui-spy-xs">
          <Checkbox
            label={t3({ en: "Replace the whole dictionary with this file", fr: "Remplacer tout le dictionnaire par ce fichier", pt: "Substituir todo o dicionário por este ficheiro" })}
            checked={replaceAllExisting()}
            onChange={setReplaceAllExisting}
          />
          <div class="text-xs">
            {t3({
              en: "Indicators the file does not name are deleted. The upload is refused if that would remove a source that has data or an indicator another formula still uses.",
              fr: "Les indicateurs absents du fichier sont supprimés. L'importation est refusée si cela supprimerait une source contenant des données ou un indicateur qu'une autre formule utilise encore.",
              pt: "Os indicadores que o ficheiro não nomeia são eliminados. O carregamento é recusado se isso removesse uma fonte com dados ou um indicador que outra fórmula ainda utiliza.",
            })}
          </div>
        </div>

        <StateHolderFormError state={handleBatchUpload.state()} />

        <div class="ui-gap-sm flex">
          <Button
            onClick={handleBatchUpload.click}
            intent="primary"
            state={handleBatchUpload.state()}
            disabled={!selectedFileName()}
            iconName="upload"
          >
            {t3({ en: "Process CSV", fr: "Traiter le CSV", pt: "Processar o CSV" })}
          </Button>
          <Button onClick={() => p.close(undefined)} intent="neutral">
            {t3(TC.cancel)}
          </Button>
        </div>
      </div>
    </FrameTop>
  );
}
