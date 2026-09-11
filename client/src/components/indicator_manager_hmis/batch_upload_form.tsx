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

// One file for the whole dictionary (PLAN_A4 ruling 7); the manager's
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
              en: "type is base, sum or derived. dhis2_id is the DHIS2 data element or operand id of a base fetched from DHIS2, and empty for an uploaded base; members is the semicolon-separated base ids of a sum; expression is a derived indicator's formula; each is empty for the other types. include_in_analysis is true or false. format_as is number, percent or rate_per_10k (a base or sum is always number). thresholds is the conditional-formatting rule as JSON, or empty. Existing indicators keep their sort order.",
              fr: "type vaut base, sum ou derived. dhis2_id est l'identifiant d'élément de données ou d'opérande DHIS2 d'un indicateur de base récupéré depuis DHIS2, et vide pour un indicateur téléversé ; members est la liste des identifiants de base d'une somme, séparés par des points-virgules ; expression est la formule d'un indicateur dérivé ; chacun est vide pour les autres types. include_in_analysis vaut true ou false. format_as vaut number, percent ou rate_per_10k (un indicateur de base ou une somme est toujours number). thresholds est la règle de mise en forme conditionnelle en JSON, ou vide. Les indicateurs existants conservent leur ordre.",
              pt: "type é base, sum ou derived. dhis2_id é o ID de elemento de dados ou operando DHIS2 de um indicador de base obtido do DHIS2, e vazio para um indicador carregado; members é a lista de IDs de base de uma soma, separados por ponto e vírgula; expression é a fórmula de um indicador derivado; cada um fica vazio para os outros tipos. include_in_analysis é true ou false. format_as é number, percent ou rate_per_10k (um indicador de base ou uma soma é sempre number). thresholds é a regra de formatação condicional em JSON, ou vazio. Os indicadores existentes mantêm a sua ordem.",
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
              en: "Indicators the file does not name are deleted. The upload is refused if that would remove an indicator that has data or one a sum or formula still uses, or move a DHIS2 id between indicators when the old one has data.",
              fr: "Les indicateurs absents du fichier sont supprimés. L'importation est refusée si cela supprimerait un indicateur contenant des données ou un indicateur qu'une somme ou une formule utilise encore, ou déplacerait un identifiant DHIS2 entre indicateurs alors que l'ancien contient des données.",
              pt: "Os indicadores que o ficheiro não nomeia são eliminados. O carregamento é recusado se isso removesse um indicador com dados ou um que uma soma ou fórmula ainda utiliza, ou movesse um ID DHIS2 entre indicadores quando o antigo tem dados.",
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
