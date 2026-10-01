import { type HmisIndicator, t3 } from "lib";
import {
  createQuery,
  StateHolderWrapper,
  Table,
  type TableColumn,
} from "panther";
import { createEffect } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  definedByText,
  indicatorSearchText,
  indicatorTypeLabel,
} from "~/components/data/hmis/_shared/mod.ts";
import { IndicatorTypeBadge } from "~/components/data/hmis/_shared/mod.ts";
import { WrapOnUnderscore } from "~/components/data/hmis/_shared/mod.ts";

type Props = {
  selectedIds: () => string[];
  setSelectedIds: (ids: string[]) => void;
  // The whole dictionary the picker loaded, Uploaded rows included, so the
  // wizard can describe what a selection expands to (the same expansion the
  // server persists at launch, which names the Uploaded parts it drops).
  onDictionaryLoaded: (indicators: HmisIndicator[]) => void;
};

// The indicator multi-select shared by the run launcher and the schedule
// editor (PLAN_A4 ruling 5): an import selects indicators; the server
// expands them to the DHIS2 elements it fetches. An Uploaded indicator is
// never fetched, so it is not offered (PLAN_A7 ruling 1).
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
      render: (item) => (
        <span class="font-mono">
          <WrapOnUnderscore text={item.indicator_common_id} />
        </span>
      ),
    },
    {
      key: "indicator_common_label",
      header: t3({ en: "Label", fr: "Libellé", pt: "Etiqueta" }),
      sortable: true,
      render: (item) => <WrapOnUnderscore text={item.indicator_common_label} />,
    },
    {
      key: "type",
      header: t3({ en: "Type", fr: "Type", pt: "Tipo" }),
      sortable: true,
      sortValue: indicatorTypeLabel,
      render: (item) => <IndicatorTypeBadge type={item.definition.type} />,
    },
    {
      key: "defined_by",
      header: t3({ en: "Defined by", fr: "Défini par", pt: "Definido por" }),
      render: (item) => (
        <span class="font-mono">
          <WrapOnUnderscore text={definedByText(item)} />
        </span>
      ),
      sortable: true,
      sortValue: definedByText,
    },
  ];

  const selectedKeysSet = () => new Set(p.selectedIds());

  return (
    <StateHolderWrapper state={indicators.state()}>
      {(keyedIndicators) => (
        <Table
          data={keyedIndicators.indicators.filter(
            (i) => i.definition.type !== "uploaded",
          )}
          columns={tableColumns}
          keyField="indicator_common_id"
          selectedKeys={selectedKeysSet}
          setSelectedKeys={(keys) =>
            p.setSelectedIds(Array.from(keys) as string[])}
          paddingY="compact"
          maxHeight="500px"
          noRowsMessage={t3({
            en: "No indicators",
            fr: "Aucun indicateur",
            pt: "Nenhum indicador",
          })}
          itemLabel={{
            one: t3({ en: "indicator", fr: "indicateur", pt: "indicador" }),
            other: t3({
              en: "indicators",
              fr: "indicateurs",
              pt: "indicadores",
            }),
          }}
          searchValue={indicatorSearchText}
          toolbar={{
            search: {
              placeholder: t3({
                en: "Search indicators",
                fr: "Rechercher des indicateurs",
                pt: "Pesquisar indicadores",
              }),
            },
          }}
        />
      )}
    </StateHolderWrapper>
  );
}
