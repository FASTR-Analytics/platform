import { type GeoJsonMapSummary, type InstanceDetail, t3 } from "lib";
import {
  Button,
  FrameTop,
  StateHolderWrapper,
  Table,
  type TableColumn,
  type TimQuery,
  getEditorWrapper,
  timActionDelete,
  timQuery,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { GeoJsonUploadWizard } from "./geojson_upload_wizard";

type Props = {
  isGlobalAdmin: boolean;
  instanceDetail: TimQuery<InstanceDetail>;
  backToInstance: () => void;
};

export function GeoJsonManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const geojsonQuery = timQuery(
    () => serverActions.getGeoJsonMaps({}),
    t3({
      en: "Loading GeoJSON maps...",
      fr: "Chargement des cartes GeoJSON...",
    }),
  );

  const silentRefresh = () => {
    geojsonQuery.fetch();
    p.instanceDetail.fetch();
  };

  async function handleUpload() {
    await openEditor({
      element: GeoJsonUploadWizard,
      props: { silentRefresh },
    });
  }

  const columns: TableColumn<GeoJsonMapSummary>[] = [
    {
      key: "adminAreaLevel",
      header: t3({ en: "Admin area level", fr: "Niveau administratif" }),
      sortable: true,
      render: (item) => <span class="font-mono">{item.adminAreaLevel}</span>,
    },
    {
      key: "uploadedAt",
      header: t3({ en: "Uploaded", fr: "Téléchargé" }),
      sortable: true,
      render: (item) => (
        <span>{new Date(item.uploadedAt).toLocaleDateString()}</span>
      ),
    },
    {
      key: "actions",
      header: "",
      alignH: "right",
      render: (item) => {
        const deleteAction = timActionDelete(
          {
            text: t3({
              en: `Delete GeoJSON for admin area level ${item.adminAreaLevel}?`,
              fr: `Supprimer le GeoJSON pour le niveau administratif ${item.adminAreaLevel} ?`,
            }),
            itemList: [`Level ${item.adminAreaLevel}`],
          },
          () =>
            serverActions.deleteGeoJsonMap({
              adminAreaLevel: item.adminAreaLevel,
            }),
          silentRefresh,
        );
        return (
          <Show when={p.isGlobalAdmin}>
            <Button
              iconName="trash"
              intent="danger"
              size="sm"
              onClick={deleteAction.click}
            />
          </Show>
        );
      },
    },
  ];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={p.backToInstance} />
            <div class="font-700 text-lg">
              {t3({ en: "GeoJSON maps", fr: "Cartes GeoJSON" })}
            </div>
            <div class="flex-1" />
            <Show when={p.isGlobalAdmin}>
              <Button iconName="plus" onClick={handleUpload}>
                {t3({ en: "Upload GeoJSON", fr: "Télécharger GeoJSON" })}
              </Button>
            </Show>
            <Button iconName="refresh" onClick={() => geojsonQuery.fetch()} />
          </div>
        }
      >
        <StateHolderWrapper state={geojsonQuery.state()}>
          {(data) => (
            <div class="ui-pad ui-spy">
              <Show
                when={data.length > 0}
                fallback={
                  <div class="text-base-500 py-8 text-center">
                    {t3({
                      en: "No GeoJSON maps uploaded yet. Upload a GeoJSON file to enable map visualizations.",
                      fr: "Aucune carte GeoJSON téléchargée. Téléchargez un fichier GeoJSON pour activer les visualisations cartographiques.",
                    })}
                  </div>
                }
              >
                <Table
                  data={data}
                  columns={columns}
                  keyField="adminAreaLevel"
                  noRowsMessage={t3({
                    en: "No GeoJSON maps",
                    fr: "Aucune carte GeoJSON",
                  })}
                />
              </Show>
            </div>
          )}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
