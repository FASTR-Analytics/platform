import {
 t3,
 type HfaVariableRow,
 type ItemsHolderDatasetHfaDisplay,
} from"lib";
import {
 Input,
 StateHolder,
 StateHolderWrapper,
 Table,
 toNum0,
 type TableColumn,
} from"panther";
import { createEffect, createMemo, createSignal } from"solid-js";
import { getDatasetHfaDisplayInfoFromCacheOrFetch } from"~/state/instance/t2_datasets";

type DisplayRow = HfaVariableRow & { _key: string };

export function DatasetItemsHolder(p: { cacheHash: string }) {
 const [itemsHolder, setItemsHolder] = createSignal<
 StateHolder<ItemsHolderDatasetHfaDisplay>
  >({
 status:"loading",
 msg: t3({ en:"Fetching data...", fr:"Récupération des données...", pt:"A obter dados..."}),
  });

 let fetchRunId = 0;
 async function attemptGetDatatable(cacheHash: string) {
 const runId = ++fetchRunId;
 setItemsHolder({
 status:"loading",
 msg: t3({ en:"Fetching data...", fr:"Récupération des données...", pt:"A obter dados..."}),
    });
 const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(cacheHash);
 if (runId !== fetchRunId) return;
 if (res.success === false) {
 setItemsHolder({ status:"error", err: res.err });
 return;
    }
 if (!res.data.rows || res.data.rows.length === 0) {
 setItemsHolder({ status:"error", err:"No data"});
 return;
    }
 setItemsHolder({
 status:"ready",
 data: res.data,
    });
  }

 createEffect(() => {
 const hash = p.cacheHash;
 attemptGetDatatable(hash);
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
 _key:`${r.varName}|${r.timePoint}`,
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
 key:"varName",
 header: t3({ en:"Variable", fr:"Variable", pt:"Variável"}),
 sortable: true,
    },
    {
 key:"varType",
 header: t3({ en:"Type", fr:"Type", pt:"Tipo"}),
 sortable: true,
    },
    {
 key:"timePoint",
 header: t3({ en:"Time Point", fr:"Point temporel", pt:"Ponto temporal"}),
 sortable: true,
    },
    {
 key:"varLabel",
 header: t3({ en:"Label", fr:"Libellé", pt:"Etiqueta"}),
 sortable: true,
    },
    {
 key:"count",
 header: t3({ en:"Count", fr:"Nombre", pt:"Contagem"}),
 sortable: true,
 alignH:"right",
 render: (item) => <>{toNum0(item.count)}</>,
    },
    {
 key:"missing",
 header: t3({ en:"Missing", fr:"Manquant", pt:"Em falta"}),
 sortable: true,
 alignH:"right",
 render: (item) => (
        <span class={item.missing > 0 ?"text-danger":""}>
          {toNum0(item.missing)}
        </span>
      ),
    },
    {
 key:"questionnaireValues",
 header: t3({ en:"Questionnaire Values", fr:"Valeurs du questionnaire", pt:"Valores do questionário"}),
 sortable: false,
 render: (item) => <span class="text-xs">{item.questionnaireValues}</span>,
    },
    {
 key:"dataValues",
 header: t3({ en:"Data Values", fr:"Valeurs des données", pt:"Valores dos dados"}),
 sortable: false,
 render: (item) => <span class="text-xs">{item.dataValues}</span>,
    },
  ];

 return (
    <div class="flex h-full w-full flex-col">
      <div class="flex-none border-b p-2">
        <div class="w-96">
          <Input
 placeholder={t3({ en:"Search variables...", fr:"Rechercher des variables...", pt:"Pesquisar variáveis..."})}
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
 noRowsMessage={t3({ en:"No variables found", fr:"Aucune variable trouvée", pt:"Nenhuma variável encontrada"})}
 fitTableToAvailableHeight
 paddingY="compact"
        />
      </div>
    </div>
  );
}
