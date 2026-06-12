import { ICEH_STRATS, ICEH_STRAT_INFO, t3, type IcehDataDetail } from "lib";
import {
  FrameTop,
  type ListItem,
  StateHolderWrapper,
  TabsNavigation,
  createQuery,
} from "panther";
import { createMemo, createSignal, Show } from "solid-js";
import { serverActions } from "~/server_actions";
import { DataTab } from "./_data_tab";
import { StratifiersTab } from "./_stratifiers_tab";
import { IndicatorsTab } from "./_indicators_tab";

export function DatasetItemsHolder(p: { detail: IcehDataDetail }) {
  const displayData = createQuery(
    async () => serverActions.getDatasetIcehDisplayData({}),
    t3({ en: "Loading...", fr: "Chargement..." }),
  );

  const [tab, setTab] = createSignal<"data" | "indicators" | "stratifiers">(
    "data",
  );
  const tabItems: ListItem<"data" | "indicators" | "stratifiers">[] = [
    { id: "data", label: t3({ en: "Data", fr: "Données" }) },
    {
      id: "indicators",
      label: t3({ en: "Indicators", fr: "Indicateurs" }),
    },
    {
      id: "stratifiers",
      label: t3({ en: "Stratifiers", fr: "Stratificateurs" }),
    },
  ];

  return (
    <StateHolderWrapper state={displayData.state()}>
      {(data) => {
        const stratsInData = createMemo(() => {
          const stratSet = new Set(data.dataRows.map((r) => r.strat));
          return ICEH_STRATS.filter((s) => stratSet.has(s))
            .map((strat) => ({
              _key: strat,
              strat,
              label: ICEH_STRAT_INFO[strat].label,
              sortOrder: ICEH_STRAT_INFO[strat].sortOrder,
              isEquityDimension: ICEH_STRAT_INFO[strat].isEquityDimension,
            }))
            .sort((a, b) => a.sortOrder - b.sortOrder);
        });

        return (
          <FrameTop panelChildren={<TabsNavigation items={tabItems} value={tab()} onChange={setTab} />}>
            <Show when={tab() === ("data")}>
              <DataTab dataRows={data.dataRows} />
            </Show>
            <Show when={tab() === ("indicators")}>
              <IndicatorsTab indicators={data.indicators} />
            </Show>
            <Show when={tab() === ("stratifiers")}>
              <StratifiersTab strats={stratsInData()} />
            </Show>
          </FrameTop>
        );
      }}
    </StateHolderWrapper>
  );
}
