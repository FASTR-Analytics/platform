import { t3, type HfaTimePoint } from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  HeadingBar,
  getEditorWrapper,
} from "panther";
import { Show } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { DeleteData } from "./_delete_data";
import { TimePointsView } from "./_time_points";
import { DatasetItemsHolder } from "./dataset_items_holder";
import { DatasetHfaImports } from "./imports";

type Props = {
  backToInstance: () => void;
};

export function InstanceDatasetHfa(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function openImports(autoOpenWizard: boolean) {
    await openEditor({
      element: DatasetHfaImports,
      props: { autoOpenWizard },
    });
  }

  async function viewTimePoints(timePoints: HfaTimePoint[]) {
    await openEditor({
      element: TimePointsView,
      props: {
        timePoints,
      },
    });
  }

  async function deleteData(timePoints: HfaTimePoint[]) {
    await openEditor({
      element: DeleteData,
      props: {
        timePoints,
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
            subheading={t3({ en: "Health Facility Assessment Data", fr: "Données d'évaluation des établissements de santé", pt: "Dados de avaliação dos estabelecimentos de saúde" })}
          />
        }
      >
        <FrameRight
          panelChildren={
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <div class="ui-pad ui-spy flex h-full w-64 flex-col overflow-auto">
                <div class="font-700 text-lg">{t3({ en: "Imports", fr: "Importations", pt: "Importações" })}</div>
                <div class="">
                  <Button
                    onClick={() => openImports(true)}
                    iconName="upload"
                    fullWidth
                  >
                    {t3({ en: "Start new import", fr: "Nouvelle importation", pt: "Iniciar nova importação" })}
                  </Button>
                </div>
                <div class="">
                  <Button
                    onClick={() => openImports(false)}
                    iconName="databaseImport"
                    outline
                    fullWidth
                  >
                    {t3({ en: "View imports", fr: "Voir les importations", pt: "Ver as importações" })}
                  </Button>
                </div>
                <Show when={instanceState.hfaTimePoints.length > 0}>
                  <div class="ui-spy text-sm">
                    <div class="">
                      <Button
                        onClick={() => viewTimePoints(instanceState.hfaTimePoints)}
                        outline
                        fullWidth
                        iconName="pencil"
                      >
                        {t3({ en: "Manage time points", fr: "Gérer les points temporels", pt: "Gerir os pontos temporais" })}
                      </Button>
                    </div>
                    <div class="">
                      <Button
                        onClick={() => deleteData(instanceState.hfaTimePoints)}
                        intent="danger"
                        iconName="trash"
                        outline
                        fullWidth
                      >
                        {t3({ en: "Delete data", fr: "Supprimer les données", pt: "Eliminar os dados" })}
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
              when={instanceState.hfaTimePoints.length > 0}
              fallback={<div class="ui-pad">{t3({ en: "No data", fr: "Aucune donnée", pt: "Sem dados" })}</div>}
            >
              <DatasetItemsHolder cacheHash={instanceState.hfaCacheHash} />
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
