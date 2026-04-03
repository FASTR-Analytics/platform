import { t3, TC, type DatasetHfaDictionaryTimePoint } from "lib";
import {
  Button,
  EditorComponentProps,
  FrameTop,
  Table,
  type TableColumn,
} from "panther";

export function TimePointsView(
  p: EditorComponentProps<
    {
      timePoints: DatasetHfaDictionaryTimePoint[];
    },
    undefined
  >,
) {
  const columns: TableColumn<DatasetHfaDictionaryTimePoint>[] = [
    {
      key: "timePoint",
      header: t3({ en: "Time Point", fr: "Point temporel" }),
      sortable: true,
    },
    {
      key: "timePointLabel",
      header: t3(TC.label),
      sortable: true,
    },
    {
      key: "dateImported",
      header: t3({ en: "Date Imported", fr: "Date d'importation" }),
      sortable: true,
      render: (item) =>
        item.dateImported
          ? new Date(item.dateImported).toLocaleString()
          : "",
    },
  ];

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad ui-gap bg-base-200 flex h-full w-full items-center">
          <Button iconName="chevronLeft" onClick={() => p.close(undefined)} />
          <div class="font-700 flex-1 truncate text-xl">
            {t3({ en: "Time Points", fr: "Points temporels" })}
          </div>
        </div>
      }
    >
      <div class="ui-pad h-full w-full">
        <Table
          data={p.timePoints}
          columns={columns}
          keyField="timePoint"
          noRowsMessage={t3({ en: "No time points found", fr: "Aucun point temporel trouvé" })}
          fitTableToAvailableHeight
        />
      </div>
    </FrameTop>
  );
}
