import { t3, type DatasetHmisVersion } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  StateHolderWrapper,
  Table,
  getEditorWrapper,
  openComponent,
  createQuery,
  toNum0,
  type TableColumn,
} from "panther";
import { serverActions } from "~/server_actions";
import { ImportInformation } from "./_import_information";

export function PreviousImports(
  p: EditorComponentProps<
    {
    },
    undefined
  >,
) {
  const { openEditor, EditorWrapper } = getEditorWrapper();

  const versions = createQuery(
    () => serverActions.getDatasetHmisVersions({}),
    t3({ en: "Loading import information...", fr: "Chargement des informations d'importation..." }),
  );

  // Only present for versions integrated via the scoped delete-then-insert
  // path — legacy DHIS2 versions (merge-integrated) have real nRowsUpdated
  // counts instead, and must keep displaying them.
  function dhis2RowsDeleted(item: DatasetHmisVersion): number | undefined {
    return item.stagingResult?.sourceType === "dhis2"
      ? item.stagingResult.dhis2RowsDeleted
      : undefined;
  }

  const columns: TableColumn<DatasetHmisVersion>[] = [
    {
      key: "id",
      header: t3({ en: "Version ID", fr: "ID de version" }),
      sortable: true,
      // width: "100px",
    },
    {
      key: "sourceType",
      header: t3({ en: "Source Type", fr: "Type de source" }),
      sortable: true,
      render: (item) =>
        item.stagingResult?.sourceType
          ? item.stagingResult.sourceType.toUpperCase()
          : "",
    },
    {
      key: "workItems",
      header: t3({ en: "DHIS2 Failures", fr: "Échecs DHIS2" }),
      sortable: true,
      render: (item) =>
        item.stagingResult?.sourceType === "dhis2"
          ? `${toNum0(item.stagingResult.failedFetches.length)} ${t3({ en: "failures", fr: "échecs" })}`
          : "",
    },
    {
      key: "dateImported",
      header: t3({ en: "Date Data was Imported", fr: "Date d'importation des données" }),
      sortable: true,
      render: (item) =>
        item.stagingResult?.dateImported
          ? new Date(item.stagingResult.dateImported).toLocaleString()
          : "",
    },
    {
      key: "nRowsInserted",
      header: t3({ en: "New Rows Inserted", fr: "Nouvelles lignes insérées" }),
      sortable: true,
      alignH: "right",
      render: (item) => item.nRowsInserted?.toLocaleString() ?? t3({ en: "Unknown", fr: "Inconnu" }),
    },
    {
      key: "nRowsUpdated",
      header: t3({ en: "Rows Updated / Removed", fr: "Lignes mises à jour / supprimées" }),
      sortable: true,
      alignH: "right",
      sortValue: (item) => dhis2RowsDeleted(item) ?? item.nRowsUpdated ?? 0,
      render: (item) => {
        const removed = dhis2RowsDeleted(item);
        return removed !== undefined
          ? `${toNum0(removed)} ${t3({ en: "removed", fr: "supprimées" })}`
          : (item.nRowsUpdated?.toLocaleString() ?? t3({ en: "Unknown", fr: "Inconnu" }));
      },
    },
    {
      key: "nRowsTotalImported",
      header: t3({ en: "Total Rows Inserted or Updated", fr: "Total de lignes insérées ou mises à jour" }),
      sortable: true,
      alignH: "right",
      render: (item) => item.nRowsTotalImported.toLocaleString(),
    },
  ];

  async function viewImportInformation(
    version: DatasetHmisVersion,
    isCurrentVersion: boolean,
  ) {
    await openEditor({
      element: ImportInformation,
      props: {
        version,
        isCurrentVersion,
      },
    });
  }

  return (
    <EditorWrapper>
      <FrameTop
        panelChildren={
          <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
            <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
            <div class="font-700 flex-1 truncate text-xl">
              {t3({ en: "Previous imports", fr: "Importations précédentes" })}
            </div>
            <div class="ui-gap-sm flex items-center">
              <Button iconName="refresh" onClick={versions.fetch} />
            </div>
          </div>
        }
      >
        <StateHolderWrapper state={versions.state()}>
          {(keyedVersions) => {
            return (
              <div class="ui-pad h-full w-full">
                <Table
                  data={keyedVersions}
                  columns={columns}
                  keyField="id"
                  noRowsMessage={t3({ en: "No previous imports found", fr: "Aucune importation précédente trouvée" })}
                  onRowClick={(version) =>
                    viewImportInformation(version, false)
                  }
                  fitTableToAvailableHeight
                />
              </div>
            );
          }}
        </StateHolderWrapper>
      </FrameTop>
    </EditorWrapper>
  );
}
