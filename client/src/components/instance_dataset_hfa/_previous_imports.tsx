import { t, t2, T, type DatasetHfaVersion } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  StateHolderWrapper,
  Table,
  openComponent,
  timQuery,
  type TableColumn,
} from "panther";
import { serverActions } from "~/server_actions";
import { ImportInformation } from "./_import_information";

export function PreviousImports(
  p: EditorComponentProps<
    {
      isGlobalAdmin: boolean;
    },
    undefined
  >,
) {
  const versions = timQuery(
    () => serverActions.getDatasetHfaVersions({}),
    "Loading import information...",
  );

  const columns: TableColumn<DatasetHfaVersion>[] = [
    {
      key: "id",
      header: t("Version ID"),
      sortable: true,
      // width: "100px",
    },
    {
      key: "dateImported",
      header: t("Date Data was Imported"),
      sortable: true,
      render: (item) =>
        item.stagingResult?.dateImported
          ? new Date(item.stagingResult.dateImported).toLocaleString()
          : "",
    },
    {
      key: "nNewRowsAdded",
      header: t("New Rows Inserted"),
      sortable: true,
      align: "right",
      render: (item) => item.nRowsInserted?.toLocaleString() ?? "Unknown",
    },
    {
      key: "nNewRowsAdded",
      header: t2(T.FRENCH_UI_STRINGS.old_rows_updated),
      sortable: true,
      align: "right",
      render: (item) => item.nRowsUpdated?.toLocaleString() ?? "Unknown",
    },
    {
      key: "nNewRowsAdded",
      header: t("Total Rows Inserted or Updated"),
      sortable: true,
      align: "right",
      render: (item) => item.nRowsTotalImported.toLocaleString(),
    },
  ];

  async function viewImportInformation(
    version: DatasetHfaVersion,
    isCurrentVersion: boolean,
  ) {
    await openComponent({
      element: ImportInformation,
      props: {
        version,
        isCurrentVersion,
        isGlobalAdmin: p.isGlobalAdmin,
      },
    });
  }

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t2(T.FRENCH_UI_STRINGS.previous_imports)}
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
                noRowsMessage={t("No previous imports found")}
                onRowClick={(version) => viewImportInformation(version, false)}
                fitTableToAvailableHeight
              />
            </div>
          );
        }}
      </StateHolderWrapper>
    </FrameTop>
  );
}
