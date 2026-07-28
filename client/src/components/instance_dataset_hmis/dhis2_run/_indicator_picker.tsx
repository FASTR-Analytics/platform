import { t3, type RawIndicatorWithMappings } from "lib";
import {
  StateHolderWrapper,
  Table,
  createQuery,
  type TableColumn,
} from "panther";
import { serverActions } from "~/server_actions";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
};

// The raw-indicator multi-select shared by the run launcher and the schedule
// editor.
export function Dhis2IndicatorPicker(p: Props) {
  const indicators = createQuery(
    () => serverActions.getIndicators({}),
    t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  );

  const tableColumns: TableColumn<RawIndicatorWithMappings>[] = [
    {
      key: "raw_indicator_id",
      header: t3({
        en: "Indicator ID",
        fr: "ID indicateur",
        pt: "ID do indicador",
      }),
      sortable: true,
    },
    {
      key: "raw_indicator_label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "indicator_common_ids",
      header: t3({ en: "Common IDs", fr: "ID communs", pt: "ID comuns" }),
      render: (item) => item.indicator_common_ids.join(", "),
      sortable: true,
    },
  ];

  const selectedKeysSet = () => new Set(p.selectedIds());

  return (
    <StateHolderWrapper state={indicators.state()} noPad>
      {(keyedIndicators) => (
        <Table
          data={keyedIndicators.rawIndicators}
          columns={tableColumns}
          keyField="raw_indicator_id"
          selectedKeys={selectedKeysSet}
          setSelectedKeys={(keys) =>
            p.setSelectedIds(Array.from(keys) as string[])
          }
          selectionLabel={t3({
            en: "indicator",
            fr: "indicateur",
            pt: "indicador",
          })}
          tableContentMaxHeight="500px"
          noRowsMessage={t3({
            en: "No indicators available",
            fr: "Aucun indicateur disponible",
            pt: "Nenhum indicador disponível",
          })}
        />
      )}
    </StateHolderWrapper>
  );
}
