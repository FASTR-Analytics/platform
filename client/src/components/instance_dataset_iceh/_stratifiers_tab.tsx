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
      header: t3({ en: "Stratifier", fr: "Stratificateur", pt: "Estratificador" }),
      sortable: true,
      render: (item) => <span class="font-mono text-xs">{item.strat}</span>,
    },
    {
      key: "label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "isEquityDimension",
      header: t3({ en: "Equity dimension", fr: "Dimension d'équité", pt: "Dimensão de equidade" }),
      sortable: true,
      render: (item) => (
        <span class={item.isEquityDimension ? "text-success" : "text-neutral"}>
          {item.isEquityDimension
            ? t3({ en: "Yes", fr: "Oui", pt: "Sim" })
            : t3({ en: "No", fr: "Non", pt: "Não" })}
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
          pt: "Nenhum estratificador encontrado",
        })}
        fitTableToAvailableHeight
        paddingY="compact"
      />
    </div>
  );
}
