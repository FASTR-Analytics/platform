import { t3, type IcehStrat } from "lib";
import { Table, type TableColumn } from "panther";

type DisplayRow = {
  _key: string;
  strat: IcehStrat;
  label: string;
  sortOrder: number;
  isEquityDimension: boolean;
};

export function StratifiersTab(p: { strats: DisplayRow[] }) {
  const columns: TableColumn<DisplayRow>[] = [
    {
      key: "strat",
      header: t3({ en: "Stratifier", fr: "Stratificateur" }),
      sortable: true,
      render: (item) => <span class="font-mono text-xs">{item.strat}</span>,
    },
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé" }),
      sortable: true,
    },
    {
      key: "isEquityDimension",
      header: t3({ en: "Equity dimension", fr: "Dimension d'équité" }),
      sortable: true,
      render: (item) => (
        <span class={item.isEquityDimension ? "text-success" : "text-neutral"}>
          {item.isEquityDimension
            ? t3({ en: "Yes", fr: "Oui" })
            : t3({ en: "No", fr: "Non" })}
        </span>
      ),
    },
  ];

  const rows: DisplayRow[] = p.strats;

  return (
    <div class="ui-pad h-full w-full">
      <Table
        data={rows}
        columns={columns}
        keyField="_key"
        noRowsMessage={t3({
          en: "No stratifiers found",
          fr: "Aucun stratificateur trouvé",
        })}
        fitTableToAvailableHeight
        paddingY="compact"
      />
    </div>
  );
}
