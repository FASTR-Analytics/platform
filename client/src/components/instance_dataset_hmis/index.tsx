import { t3 } from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  HeadingBar,
  getEditorWrapper,
} from "panther";
import { Show } from "solid-js";
import { DatasetHmisImports } from "./imports";
import { instanceState, structureSchemaForFamily } from "~/state/instance/t1_store";
import { DeleteData } from "./_delete_data";
import { ImportLedger } from "./_import_ledger";
import { DatasetItemsHolder } from "./dataset_items_holder";

type Props = {
  backToInstance: () => void;
};

export function InstanceDatasetHmis(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function openImports(autoOpenCsvWizard: boolean) {
    await openEditor({
      element: DatasetHmisImports,
      props: {
        silentFetch: async () => {},
        autoOpenCsvWizard,
      },
    });
  }

  async function viewImportLedger() {
    await openEditor({
      element: ImportLedger,
      props: {},
    });
  }

  async function deleteData() {
    const versionId = instanceState.datasetVersions.hmis;
    if (versionId === undefined) return;
    await openEditor({
      element: DeleteData,
      props: {
        hmisVersionId: versionId,
        indicatorMappingsVersion: instanceState.indicatorMappingsVersion,
        structureSchema: structureSchemaForFamily("hmis"),
        silentFetch: async () => {},
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={p.backToInstance}
            heading={t3({ en: "DATA SOURCE", fr: "SOURCE DE DONNÉES", pt: "FONTE DE DADOS" })}
            subheading={t3({ en: "HMIS Data", fr: "Données HMIS", pt: "Dados HMIS" })}
          />
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <div class="font-700 text-lg">
                  {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                </div>
                <Show when={instanceState.hmisScheduledImportAttention}>
                  <div class="ui-pad border-danger bg-danger-subtle rounded border text-sm">
                    {t3({
                      en: "A scheduled DHIS2 import needs attention.",
                      fr: "Une importation DHIS2 planifiée nécessite votre attention.",
                      pt: "Uma importação DHIS2 agendada precisa de atenção.",
                    })}
                  </div>
                </Show>
                <div class="">
                  <Button
                    onClick={() => openImports(false)}
                    iconName="databaseImport"
                    fullWidth
                  >
                    {t3({
                      en: "Import from DHIS2",
                      fr: "Importer depuis DHIS2",
                      pt: "Importar do DHIS2",
                    })}
                  </Button>
                </div>
                <div class="">
                  <Button
                    onClick={() => openImports(true)}
                    iconName="upload"
                    fullWidth
                  >
                    {t3({
                      en: "Upload CSV file",
                      fr: "Téléverser un fichier CSV",
                      pt: "Carregar um ficheiro CSV",
                    })}
                  </Button>
                </div>
                <Show when={instanceState.hmisImportRunActive}>
                  <div class="ui-pad bg-base-200 rounded border text-sm">
                    {t3({
                      en: "An import is running — see Imports for progress.",
                      fr: "Une importation est en cours — voir Importations pour la progression.",
                      pt: "Há uma importação em curso — ver Importações para o progresso.",
                    })}
                  </div>
                </Show>
                <Show when={instanceState.hmisImportRunsQueued > 0}>
                  <div class="ui-pad bg-base-200 rounded border text-sm">
                    {instanceState.hmisImportRunsQueued}{" "}
                    {t3({
                      en: "import(s) queued.",
                      fr: "importation(s) en file d'attente.",
                      pt: "importação(ões) em fila.",
                    })}
                  </div>
                </Show>
                <Show when={instanceState.hmisNVersions > 0}>
                  <div class="ui-spy text-sm">
                    <div class="">
                      <Button
                        onClick={viewImportLedger}
                        outline
                        fullWidth
                        iconName="databaseImport"
                      >
                        {t3({
                          en: "Import status by indicator",
                          fr: "État des importations par indicateur",
                          pt: "Estado das importações por indicador",
                        })}
                      </Button>
                    </div>
                    <div class="">
                      <Button
                        onClick={deleteData}
                        intent="danger"
                        iconName="trash"
                        outline
                        fullWidth
                      >
                        {t3({
                          en: "Delete data",
                          fr: "Supprimer les données",
                          pt: "Eliminar os dados",
                        })}
                      </Button>
                    </div>
                  </div>
                </Show>
              </div>
            </Show>
          }
        >
          <div class="h-full w-full">
            <Show
              when={instanceState.datasetVersions.hmis}
              fallback={
                <div class="ui-pad">
                  {t3({ en: "No data", fr: "Aucune donnée", pt: "Sem dados" })}
                </div>
              }
              keyed
            >
              {(versionId) => (
                <DatasetItemsHolder
                  versionId={versionId}
                  indicatorMappingsVersion={instanceState.indicatorMappingsVersion}
                  structureSchema={structureSchemaForFamily("hmis")}
                />
              )}
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
