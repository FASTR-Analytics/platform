import { t3, type IcehDataDetail } from "lib";
import {
  Button,
  FrameRight,
  FrameTop,
  HeadingBar,
  getEditorWrapper,
} from "panther";
import { Show, createEffect, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { DatasetItemsHolder } from "./dataset_items_holder";
import { DeleteData } from "./_delete_data";
import { DatasetIcehImports } from "./imports";

type Props = {
  backToInstance: () => void;
};

export function InstanceDatasetIceh(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const [detail, setDetail] = createSignal<IcehDataDetail | undefined>(
    undefined
  );

  async function fetchDetail() {
    try {
      const result = await serverActions.getDatasetIcehDetail({});
      if (result.success) {
        setDetail(result.data);
      }
    } catch {
      // Silent fail
    }
  }

  // The cache hash flips on every import/delete (SSE-pushed), so tracking it
  // keeps the sidebar's data facts fresh with no polling.
  createEffect(() => {
    void instanceState.icehCacheHash;
    void fetchDetail();
  });

  async function openImports() {
    await openEditor({ element: DatasetIcehImports, props: {} });
    await fetchDetail();
  }

  async function deleteData() {
    await openEditor({
      element: DeleteData,
      props: {
        silentFetch: fetchDetail,
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
            subheading={t3({ en: "ICEH Equity Data", fr: "Données d'équité ICEH", pt: "Dados de equidade ICEH" })}
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
                <Show when={detail() && detail()!.dataRows > 0}>
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
                </Show>
              </div>
            </Show>
          }
        >
          <div class="h-full w-full">
            <Show
              when={detail() && detail()!.dataRows > 0}
              fallback={
                <div class="ui-pad">
                  {t3({ en: "No data", fr: "Aucune donnée", pt: "Sem dados" })}
                </div>
              }
            >
              <DatasetItemsHolder />
            </Show>
          </div>
        </FrameRight>
      </FrameTop>
    </EditorWrapper>
  );
}
