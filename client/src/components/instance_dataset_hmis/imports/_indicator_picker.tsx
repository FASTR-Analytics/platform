import { t3, type HmisIndicator } from "lib";
import {
  StateHolderWrapper,
  Table,
  createQuery,
  type TableColumn,
} from "panther";
import { createEffect } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  definedByText,
  indicatorTypeLabel,
} from "~/components/indicator_manager_hmis/_indicator_display";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  // The dictionary the picker loaded, so the wizard can count the DHIS2
  // elements a selection expands to (the same expansion the server persists
  // at launch).
  onDictionaryLoaded: (indicators: HmisIndicator[]) => void;
};

// The indicator multi-select shared by the run launcher and the schedule
// editor (PLAN_A4 ruling 5): an import selects indicators; the server
// expands them to the DHIS2 elements it fetches.
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

  const tableColumns: TableColumn<HmisIndicator>[] = [
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
      key: "type",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: indicatorTypeLabel,
      render: indicatorTypeLabel,
    },
    {
      key: "defined_by",
      header: t3({ en: "Defined by", fr: "Défini par", pt: "Definido por" }),
      render: (item) => <span class="font-mono text-xs">{definedByText(item)}</span>,
      sortable: true,
      sortValue: definedByText,
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
