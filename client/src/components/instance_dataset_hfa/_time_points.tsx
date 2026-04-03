import { t, type DatasetHfaDictionaryTimePoint } from "lib";
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
      header: t("Time Point"),
      sortable: true,
    },
    {
      key: "timePointLabel",
      header: t("Label"),
      sortable: true,
    },
    {
      key: "dateImported",
      header: t("Date Imported"),
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
            {t("Time Points")}
          </div>
        </div>
      }
    >
      <div class="ui-pad h-full w-full">
        <Table
          data={p.timePoints}
          columns={columns}
          keyField="timePoint"
          noRowsMessage={t("No time points found")}
          fitTableToAvailableHeight
        />
      </div>
    </FrameTop>
  );
}
