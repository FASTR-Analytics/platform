import { type FacilityFamily, type GeoJsonMapSummary, t3 } from "lib";
import {
  Button,
  FrameTop,
  HeadingBar,
  Table,
  type TableColumn,
  getEditorWrapper,
  createDeleteAction,
} from "panther";
import { Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { instanceState } from "~/state/instance/t1_store";
import { GeoJsonUploadWizard } from "./geojson_upload_wizard/index";
import { GeoJsonEditModal } from "./geojson_edit_modal";

type Props = {
  family: FacilityFamily;
  backToInstance: () => void;
};

function familyHeading(family: FacilityFamily): string {
  return family === "hmis"
    ? t3({
        en: "HMIS registry maps",
        fr: "Cartes du registre SNIS",
        pt: "Mapas do registo SNIS",
      })
    : t3({
        en: "HFA registry maps",
        fr: "Cartes du registre Enquêtes FOSA",
        pt: "Mapas do registo FOSA",
      });
}

export function GeoJsonManager(p: Props) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  async function handleUpload(family: FacilityFamily) {
    await openEditor({
      element: GeoJsonUploadWizard,
      props: { family },
    });
  }

  async function handleEdit(family: FacilityFamily, level: 2 | 3 | 4) {
    await openEditor({
      element: GeoJsonEditModal,
      props: {
        family,
        adminAreaLevel: level,
      },
    });
  }

  const maps = () =>
    instanceState.geojsonMaps.filter((g) => g.family === p.family);

  const columns: TableColumn<GeoJsonMapSummary>[] = [
    {
      key: "adminAreaLevel",
      header: t3({
        en: "Admin area level",
        fr: "Niveau administratif",
        pt: "Nível de zona administrativa",
      }),
      sortable: true,
      render: (item) => <span class="font-mono">{item.adminAreaLevel}</span>,
    },
    {
      key: "uploadedAt",
      header: t3({ en: "Uploaded", fr: "Téléchargé", pt: "Carregado" }),
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
        const deleteAction = createDeleteAction(
          {
            text: t3({
              en: `Delete ${p.family === "hmis" ? "HMIS" : "HFA"} GeoJSON for admin area level ${item.adminAreaLevel}?`,
              fr: `Supprimer le GeoJSON ${p.family === "hmis" ? "SNIS" : "Enquêtes FOSA"} pour le niveau administratif ${item.adminAreaLevel} ?`,
              pt: `Eliminar o GeoJSON ${p.family === "hmis" ? "SNIS" : "FOSA"} para o nível de zona administrativa ${item.adminAreaLevel}?`,
            }),
            itemList: [`Level ${item.adminAreaLevel}`],
          },
          () =>
            serverActions.deleteGeoJsonMap({
              family: p.family,
              adminAreaLevel: item.adminAreaLevel,
            }),
        );
        return (
          <Show when={instanceState.currentUserIsGlobalAdmin}>
            <div class="flex gap-2">
              <Button
                iconName="pencil"
                intent="neutral"
                size="sm"
                onClick={() =>
                  handleEdit(
                    p.family,
                    item.adminAreaLevel as 2 | 3 | 4,
                  )
                }
              />
              <Button
                iconName="trash"
                intent="danger"
                size="sm"
                onClick={deleteAction.click}
              />
            </div>
          </Show>
        );
      },
    },
  ];

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <HeadingBar
            tonal
            onBack={p.backToInstance}
            heading={familyHeading(p.family)}
          >
            <Show when={instanceState.currentUserIsGlobalAdmin}>
              <Button iconName="plus" onClick={() => handleUpload(p.family)}>
                {t3({
                  en: "Upload GeoJSON",
                  fr: "Télécharger GeoJSON",
                  pt: "Carregar GeoJSON",
                })}
              </Button>
            </Show>
          </HeadingBar>
        }
      >
        <div class="ui-pad ui-spy">
          <Show
            when={maps().length > 0}
            fallback={
              <div class="text-base-content-muted py-8 text-center">
                {t3({
                  en: "No GeoJSON maps uploaded for this registry yet. Upload a GeoJSON file to enable map visualizations.",
                  fr: "Aucune carte GeoJSON téléchargée pour ce registre. Téléchargez un fichier GeoJSON pour activer les visualisations cartographiques.",
                  pt: "Ainda não foi carregado nenhum mapa GeoJSON para este registo. Carregue um ficheiro GeoJSON para ativar as visualizações de mapas.",
                })}
              </div>
            }
          >
            <Table
              data={maps()}
              columns={columns}
              keyField="adminAreaLevel"
              noRowsMessage={t3({
                en: "No GeoJSON maps",
                fr: "Aucune carte GeoJSON",
                pt: "Nenhum mapa GeoJSON",
              })}
            />
          </Show>
        </div>
      </FrameTop>
    </EditorWrapper>
  );
}
