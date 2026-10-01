import {
  type HfaVariableRow,
  type ItemsHolderDatasetHfaDisplay,
  t3,
} from "lib";
import {
  StateHolder,
  StateHolderWrapper,
  Table,
  type TableColumn,
  toNum0,
} from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { getDatasetHfaDisplayInfoFromCacheOrFetch } from "~/state/instance/t2_datasets";

type DisplayRow = HfaVariableRow & { _key: string };

export function DatasetItemsHolder(p: { cacheHash: string }) {
  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<ItemsHolderDatasetHfaDisplay>
  >({
    status: "loading",
    msg: t3({
      en: "Fetching data...",
      fr: "Récupération des données...",
      pt: "A obter dados...",
    }),
  });

  let fetchRunId = 0;
  async function attemptGetDatatable(cacheHash: string) {
    const runId = ++fetchRunId;
    setItemsHolder({
      status: "loading",
      msg: t3({
        en: "Fetching data...",
        fr: "Récupération des données...",
        pt: "A obter dados...",
      }),
    });
    const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(cacheHash);
    if (runId !== fetchRunId) return;
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
    const hash = p.cacheHash;
    attemptGetDatatable(hash);
  });

  return (
    <StateHolderWrapper state={itemsHolder()} loadingAndErrorPad="md">
      {(data) => <DatasetDisplayPresentation displayItems={data} />}
    </StateHolderWrapper>
  );
}

function DatasetDisplayPresentation(p: {
  displayItems: ItemsHolderDatasetHfaDisplay;
}) {
  const rows = createMemo<DisplayRow[]>(() =>
    p.displayItems.rows.map((r) => ({
      ...r,
      _key: `${r.variableId}|${r.timePoint}`,
    }))
  );

  const columns: TableColumn<DisplayRow>[] = [
    {
      key: "variableId",
      header: t3({
        en: "Variable ID",
        fr: "ID de variable",
        pt: "ID da variável",
      }),
      sortable: true,
    },
    {
      key: "variableType",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
    },
    {
      key: "timePoint",
      header: t3({
        en: "Time Point",
        fr: "Point temporel",
        pt: "Ponto temporal",
      }),
      sortable: true,
    },
    {
      key: "variableLabel",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "count",
      header: t3({ en: "Count", fr: "Nombre", pt: "Contagem" }),
      sortable: true,
      alignH: "right",
      render: (item) => <>{toNum0(item.count)}</>,
    },
    {
      key: "missing",
      header: t3({ en: "Missing", fr: "Manquant", pt: "Em falta" }),
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
      header: t3({
        en: "Questionnaire Values",
        fr: "Valeurs du questionnaire",
        pt: "Valores do questionário",
      }),
      sortable: false,
      render: (item) => <span>{item.questionnaireValues}</span>,
    },
    {
      key: "dataValues",
      header: t3({
        en: "Data Values",
        fr: "Valeurs des données",
        pt: "Valores dos dados",
      }),
      sortable: false,
      render: (item) => <span>{item.dataValues}</span>,
    },
  ];

  return (
    <div class="ui-pad h-full w-full">
      <Table
        data={rows()}
        columns={columns}
        keyField="_key"
        noRowsMessage={t3({
          en: "No variables found",
          fr: "Aucune variable trouvée",
          pt: "Nenhuma variável encontrada",
        })}
        itemLabel={{
          one: t3({ en: "variable", fr: "variable", pt: "variável" }),
          other: t3({ en: "variables", fr: "variables", pt: "variáveis" }),
        }}
        searchValue={(r) =>
          `${r.variableId} ${r.variableLabel} ${r.questionnaireValues}`}
        toolbar={{
          search: {
            placeholder: t3({
              en: "Search variables...",
              fr: "Rechercher des variables...",
              pt: "Pesquisar variáveis...",
            }),
          },
        }}
        paddingY="compact"
      />
    </div>
  );
}
