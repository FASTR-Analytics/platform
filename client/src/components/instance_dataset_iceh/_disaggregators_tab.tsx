import { t3, type IcehDisaggregator } from "lib";
import { StateHolderWrapper, Table, timQuery, type TableColumn } from "panther";
import { serverActions } from "~/server_actions";

type DisplayRow = IcehDisaggregator & { _key: string };

export function DisaggregatorsTab() {
  const disaggregators = timQuery(
    async () => serverActions.getDatasetIcehDisaggregators({}),
    t3({
      en: "Loading disaggregators...",
      fr: "Chargement des désagrégateurs...",
    })
  );

  return (
    <StateHolderWrapper state={disaggregators.state()}>
      {(data) => {
        const rows: DisplayRow[] = data.map((r) => ({
          ...r,
          _key: r.strat,
        }));

        const columns: TableColumn<DisplayRow>[] = [
          {
            key: "strat",
            header: t3({ en: "Stratifier", fr: "Stratificateur" }),
            sortable: true,
            render: (item) => (
              <span class="font-mono text-xs">{item.strat}</span>
            ),
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
              <span
                class={item.isEquityDimension ? "text-success" : "text-neutral"}
              >
                {item.isEquityDimension
                  ? t3({ en: "Yes", fr: "Oui" })
                  : t3({ en: "No", fr: "Non" })}
              </span>
            ),
          },
        ];

        return (
          <div class="ui-pad h-full w-full">
            <Table
              data={rows}
              columns={columns}
              keyField="_key"
              noRowsMessage={t3({
                en: "No disaggregators found",
                fr: "Aucun désagrégateur trouvé",
              })}
              fitTableToAvailableHeight
              paddingY="compact"
            />
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}
