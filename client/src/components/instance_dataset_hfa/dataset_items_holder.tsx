import {
  t3,
  type HfaVariableRow,
  type ItemsHolderDatasetHfaDisplay,
} from "lib";
import {
  Input,
  StateHolder,
  StateHolderWrapper,
  Table,
  toNum0,
  type TableColumn,
} from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { getDatasetHfaDisplayInfoFromCacheOrFetch } from "~/state/instance/t2_datasets";

type DisplayRow = HfaVariableRow & { _key: string };

export function DatasetItemsHolder(p: { cacheHash: string }) {
  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<ItemsHolderDatasetHfaDisplay>
  >({
    status: "loading",
    msg: t3({ en: "Fetching data...", fr: "Récupération des données..." }),
  });

  async function attemptGetDatatable() {
    setItemsHolder({
      status: "loading",
      msg: t3({ en: "Fetching data...", fr: "Récupération des données..." }),
    });
    const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(p.cacheHash);
    if (res.success === false) {
      setItemsHolder({ status: "error", err: res.err });
      return;
    }
    if (!res.data.rows || res.data.rows.length === 0) {
      setItemsHolder({ status: "error", err: "No data" });
      return;
    }
    setItemsHolder({
      status: "ready",
      data: res.data,
    });
  }

  createEffect(() => {
    attemptGetDatatable();
  });

  return (
    <StateHolderWrapper state={itemsHolder()}>
      {(data) => <DatasetDisplayPresentation displayItems={data} />}
    </StateHolderWrapper>
  );
}

function DatasetDisplayPresentation(p: {
  displayItems: ItemsHolderDatasetHfaDisplay;
}) {
  const [searchText, setSearchText] = createSignal("");

  const rows = createMemo<DisplayRow[]>(() => {
    const search = searchText().toLowerCase();
    const allRows: DisplayRow[] = p.displayItems.rows.map((r) => ({
      ...r,
      _key: `${r.varName}|${r.timePoint}`,
    }));
    if (!search) return allRows;
    return allRows.filter(
      (r) =>
        r.varName.toLowerCase().includes(search) ||
        r.varLabel.toLowerCase().includes(search) ||
        r.questionnaireValues.toLowerCase().includes(search),
    );
  });

  const columns: TableColumn<DisplayRow>[] = [
    {
      key: "varName",
      header: t3({ en: "Variable", fr: "Variable" }),
      sortable: true,
    },
    {
      key: "varType",
      header: t3({ en: "Type", fr: "Type" }),
      sortable: true,
    },
    {
      key: "timePoint",
      header: t3({ en: "Time Point", fr: "Point temporel" }),
      sortable: true,
    },
    {
      key: "varLabel",
      header: t3({ en: "Label", fr: "Libellé" }),
      sortable: true,
    },
    {
      key: "count",
      header: t3({ en: "Count", fr: "Nombre" }),
      sortable: true,
      alignH: "right",
      render: (item) => <>{toNum0(item.count)}</>,
    },
    {
      key: "missing",
      header: t3({ en: "Missing", fr: "Manquant" }),
      sortable: true,
      alignH: "right",
      render: (item) => (
        <span class={item.missing > 0 ? "text-danger" : ""}>
          {toNum0(item.missing)}
        </span>
      ),
    },
    {
      key: "questionnaireValues",
      header: t3({ en: "Questionnaire Values", fr: "Valeurs du questionnaire" }),
      sortable: false,
      render: (item) => <span class="text-xs">{item.questionnaireValues}</span>,
    },
    {
      key: "dataValues",
      header: t3({ en: "Data Values", fr: "Valeurs des données" }),
      sortable: false,
      render: (item) => <span class="text-xs">{item.dataValues}</span>,
    },
  ];

  return (
    <div class="flex h-full w-full flex-col">
      <div class="border-base-300 flex-none border-b p-2">
        <div class="w-96">
          <Input
            placeholder={t3({ en: "Search variables...", fr: "Rechercher des variables..." })}
            value={searchText()}
            onChange={setSearchText}
            searchIcon
            fullWidth
          />
        </div>
      </div>
      <div class="ui-pad min-h-0 flex-1">
        <Table
          data={rows()}
          columns={columns}
          keyField="_key"
          noRowsMessage={t3({ en: "No variables found", fr: "Aucune variable trouvée" })}
          fitTableToAvailableHeight
          paddingY="compact"
        />
      </div>
    </div>
  );
}
