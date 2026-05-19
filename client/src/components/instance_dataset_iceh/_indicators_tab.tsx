import { t3, type IcehIndicator } from "lib";
import { StateHolderWrapper, Table, timQuery, type TableColumn } from "panther";
import { serverActions } from "~/server_actions";

type DisplayRow = IcehIndicator & { _key: string };

export function IndicatorsTab() {
  const indicators = timQuery(
    async () => serverActions.getDatasetIcehIndicators({}),
    t3({ en: "Loading indicators...", fr: "Chargement des indicateurs..." })
  );

  return (
    <StateHolderWrapper state={indicators.state()}>
      {(data) => {
        const rows: DisplayRow[] = data.map((r) => ({
          ...r,
          _key: r.indicatorCode,
        }));

        const columns: TableColumn<DisplayRow>[] = [
          {
            key: "indicatorCode",
            header: t3({ en: "Code", fr: "Code" }),
            sortable: true,
            render: (item) => (
              <span class="font-mono text-xs">{item.indicatorCode}</span>
            ),
          },
          {
            key: "indicatorName",
            header: t3({ en: "Name", fr: "Nom" }),
            sortable: true,
          },
          {
            key: "category",
            header: t3({ en: "Category", fr: "Catégorie" }),
            sortable: true,
          },
          {
            key: "numerator",
            header: t3({ en: "Numerator", fr: "Numérateur" }),
            sortable: false,
            render: (item) => <span class="text-xs">{item.numerator}</span>,
          },
          {
            key: "denominator",
            header: t3({ en: "Denominator", fr: "Dénominateur" }),
            sortable: false,
            render: (item) => <span class="text-xs">{item.denominator}</span>,
          },
        ];

        return (
          <div class="ui-pad h-full w-full">
            <Table
              data={rows}
              columns={columns}
              keyField="_key"
              noRowsMessage={t3({
                en: "No indicators found",
                fr: "Aucun indicateur trouvé",
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
