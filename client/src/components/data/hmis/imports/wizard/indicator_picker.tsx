import { t3, type HmisIndicator } from "lib";
import {
  Input,
  StateHolderWrapper,
  Table,
  createQuery,
  type TableColumn,
} from "panther";
import { createEffect, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";
import {
  definedByText,
  indicatorTypeLabel,
  matchesIndicatorSearch,
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
  const [search, setSearch] = createSignal("");

  return (
    <StateHolderWrapper state={indicators.state()} noPad>
      {(keyedIndicators) => (
        <div class="ui-spy-sm">
          <div class="ui-gap flex items-center justify-between">
            <div class="ui-text-heading">
              {p.selectedIds().length === 1
                ? t3({
                    en: "1 selected indicator",
                    fr: "1 indicateur sélectionné",
                    pt: "1 indicador selecionado",
                  })
                : t3({
                    en: `${p.selectedIds().length} selected indicators`,
                    fr: `${p.selectedIds().length} indicateurs sélectionnés`,
                    pt: `${p.selectedIds().length} indicadores selecionados`,
                  })}
            </div>
            <div class="w-80">
              <Input
                value={search()}
                onChange={setSearch}
                searchIcon
                clearable
                fullWidth
                placeholder={t3({
                  en: "Search indicators",
                  fr: "Rechercher des indicateurs",
                  pt: "Pesquisar indicadores",
                })}
              />
            </div>
          </div>
          <Table
            data={keyedIndicators.indicators.filter(
              (i) =>
                i.definition.type !== "uploaded" &&
                matchesIndicatorSearch(i, search()),
            )}
            columns={tableColumns}
            keyField="indicator_common_id"
            selectedKeys={selectedKeysSet}
            setSelectedKeys={(keys) =>
              p.setSelectedIds(Array.from(keys) as string[])
            }
            paddingY="compact"
            maxHeight="500px"
            noRowsMessage={t3({
              en: "No indicators match",
              fr: "Aucun indicateur ne correspond",
              pt: "Nenhum indicador corresponde",
            })}
          />
        </div>
      )}
    </StateHolderWrapper>
  );
}
