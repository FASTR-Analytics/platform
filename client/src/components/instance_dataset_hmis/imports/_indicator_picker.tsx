import { t3, type CommonIndicator } from "lib";
import {
  StateHolderWrapper,
  Table,
  createQuery,
  type TableColumn,
} from "panther";
import { createEffect } from "solid-js";
import { serverActions } from "~/server_actions";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  // The dictionary the picker loaded, so the wizard can count the sources a
  // selection expands to (the same expansion the server persists at launch).
  onDictionaryLoaded: (indicators: CommonIndicator[]) => void;
};

// The indicator multi-select shared by the run launcher and the schedule
// editor (PLAN_A3 ruling 7): an import selects indicators; the server
// expands them to their sources.
export function Dhis2IndicatorPicker(p: Props) {
  const indicators = createQuery(
    () => serverActions.getIndicators({}),
    t3({
      en: "Loading indicators...",
      fr: "Chargement des indicateurs...",
      pt: "A carregar os indicadores...",
    }),
  );

  createEffect(() => {
    const s = indicators.state();
    if (s.status === "ready") {
      p.onDictionaryLoaded(s.data.indicators);
    }
  });

  const tableColumns: TableColumn<CommonIndicator>[] = [
    {
      key: "indicator_common_id",
      header: t3({
        en: "Indicator ID",
        fr: "ID indicateur",
        pt: "ID do indicador",
      }),
      sortable: true,
    },
    {
      key: "indicator_common_label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
    },
    {
      key: "definition",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: (item) => item.definition.type,
      render: (item) =>
        item.definition.type === "base"
          ? t3({ en: "Base", fr: "De base", pt: "Base" })
          : t3({ en: "Derived", fr: "Dérivé", pt: "Derivado" }),
    },
    {
      key: "sources",
      header: t3({ en: "Sources", fr: "Sources", pt: "Fontes" }),
      render: (item) => definedByText(item),
      sortable: true,
      sortValue: (item) => definedByText(item),
    },
  ];

  const selectedKeysSet = () => new Set(p.selectedIds());

  return (
    <StateHolderWrapper state={indicators.state()} noPad>
      {(keyedIndicators) => (
        <Table
          data={keyedIndicators.indicators}
          columns={tableColumns}
          keyField="indicator_common_id"
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

function definedByText(indicator: CommonIndicator): string {
  switch (indicator.definition.type) {
    case "base":
      return indicator.definition.dhis2_id ?? "";
    case "sum":
      return indicator.definition.members.join(", ");
    case "derived":
      return indicator.definition.expression;
  }
}
