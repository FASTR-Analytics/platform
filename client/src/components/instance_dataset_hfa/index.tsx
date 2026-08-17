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

  async function openImports() {
    await openEditor({ element: DatasetHfaImports, props: {} });
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
                <div class="">
                  <Button onClick={openImports} iconName="databaseImport" fullWidth>
                    {t3({ en: "Imports", fr: "Importations", pt: "Importações" })}
                  </Button>
                </div>
                <Show when={instanceState.hfaTimePoints.length > 0}>
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
