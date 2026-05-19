import { t3, type IcehDataDetail } from "lib";
import { FrameTop, getTabs, TabsNavigation } from "panther";
import { Show } from "solid-js";
import { DataTab } from "./_data_tab";
import { DisaggregatorsTab } from "./_disaggregators_tab";
import { IndicatorsTab } from "./_indicators_tab";

export function DatasetItemsHolder(p: { detail: IcehDataDetail }) {
  const tabs = getTabs([
    { value: "data", label: t3({ en: "Data", fr: "Données" }) },
    {
      value: "indicators",
      label: t3({ en: "Indicators", fr: "Indicateurs" }),
    },
    {
      value: "disaggregators",
      label: t3({ en: "Disaggregators", fr: "Désagrégateurs" }),
    },
  ]);

  return (
    <FrameTop
      panelChildren={
        <div class="ui-pad-x border-base-300 flex h-full items-center border-b">
          <TabsNavigation tabs={tabs} />
        </div>
      }
    >
      <Show when={tabs.isTabActive("data")}>
        <DataTab />
      </Show>
      <Show when={tabs.isTabActive("indicators")}>
        <IndicatorsTab />
      </Show>
      <Show when={tabs.isTabActive("disaggregators")}>
        <DisaggregatorsTab />
      </Show>
    </FrameTop>
  );
}
