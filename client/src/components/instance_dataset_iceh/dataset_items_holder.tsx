import { ICEH_STRATS, ICEH_STRAT_INFO, t3, TC, type IcehDataDetail, type IcehDisplayData } from "lib";
import {
  FrameTop,
  type ListItem,
  StateHolder,
  StateHolderWrapper,
  TabsNavigation,
} from "panther";
import { createEffect, createMemo, createSignal, onCleanup, Show } from "solid-js";
import { instanceState } from "~/state/instance/t1_store";
import { getDatasetIcehDisplayInfoFromCacheOrFetch } from "~/state/instance/t2_datasets";
import { DataTab } from "./_data_tab";
import { StratifiersTab } from "./_stratifiers_tab";
import { IndicatorsTab } from "./_indicators_tab";

export function DatasetItemsHolder(p: { detail: IcehDataDetail }) {
  const [displayData, setDisplayData] = createSignal<StateHolder<IcehDisplayData>>({
    status: "loading",
    msg: t3(TC.fetchingData),
  });

  createEffect(() => {
    const cacheHash = instanceState.icehCacheHash;
    const controller = new AbortController();
    onCleanup(() => controller.abort());
    async function load() {
      const res = await getDatasetIcehDisplayInfoFromCacheOrFetch(cacheHash);
      if (controller.signal.aborted) return;
      if (res.success) {
        setDisplayData({ status: "ready", data: res.data });
      } else {
        setDisplayData({ status: "error", err: res.err });
      }
    }
    load();
  });

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
    <StateHolderWrapper state={displayData()}>
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
