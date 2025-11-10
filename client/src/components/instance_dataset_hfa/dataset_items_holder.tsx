import {
  getAbcQualScale,
  getCalendar,
  t,
  t2,
  T,
  type ItemsHolderDatasetHfaDisplay,
} from "lib";
import {
  ADTFigure,
  ChartHolder,
  Csv,
  FrameLeft,
  MultiSelect,
  RadioGroup,
  Slider,
  StateHolder,
  StateHolderWrapper,
  TableFromCsv,
  getSelectOptionsWithFirstCapital,
  toNum0,
  type CustomFigureStyleOptions,
} from "panther";
import { createEffect, createMemo, createSignal } from "solid-js";
import { createStore } from "solid-js/store";
import { getDatasetHfaDisplayInfoFromCacheOrFetch } from "~/state/dataset_cache";

type Props = {
  versionId: number;
};

export function DatasetItemsHolder(p: Props) {
  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<ItemsHolderDatasetHfaDisplay>
  >({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
  });

  async function attemptGetDatatable(versionId: number) {
    setItemsHolder({
      status: "loading",
      msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
    });
    const res = await getDatasetHfaDisplayInfoFromCacheOrFetch(versionId);
    if (res.success === false) {
      setItemsHolder({ status: "error", err: res.err });
      return;
    }
    if (res.data.vizItems.length === 0) {
      setItemsHolder({ status: "error", err: "No rows" });
      return;
    }
    setItemsHolder({
      status: "ready",
      data: res.data,
    });
  }

  createEffect(() => {
    attemptGetDatatable(p.versionId);
  });

  return (
    <StateHolderWrapper state={itemsHolder()}>
      {(keyedDatasetItems) => {
        return <DatasetDisplayPresentation displayItems={keyedDatasetItems} />;
      }}
    </StateHolderWrapper>
  );
}

type DatasetDisplayPresentationProps = {
  displayItems: ItemsHolderDatasetHfaDisplay;
};

function DatasetDisplayPresentation(p: DatasetDisplayPresentationProps) {
  const [vizConfig, setVizConfig] = createStore({
    // value: "count" as "count" | "sum",
    figureType: "chart" as "table" | "chart",
    scale: 1,
    // indicators: p.displayItems.indicators.map((ind) => ind.value),
  });

  // const filteredVizItems = createMemo(() => {
  //   const indicatorsToVizualize = vizConfig.indicators;
  //   if (p.displayItems.indicators.length === indicatorsToVizualize.length) {
  //     return p.displayItems.vizItems;
  //   }
  //   return p.displayItems.vizItems.filter((row) => {
  //     return (
  //       indicatorsToVizualize?.includes(row["indicator_common_id"]) ?? true
  //     );
  //   });
  // });
  const csv = createMemo(() => {
    const csvData = Csv.fromObjectArray(p.displayItems.vizItems).orderCols([
      "var_name",
      "count",
    ]);
    // Notify parent when CSV is ready
    return csvData;
  });

  const figureInputs = createMemo<ADTFigure>(() => {
    const jsonArray = p.displayItems.vizItems;
    // const value = vizConfig.value;
    const figureType = vizConfig.figureType;
    const scale = vizConfig.scale;

    const style: CustomFigureStyleOptions = {
      legend: {
        maxLegendItemsInOneColumn: 6,
      },
      scale: scale,
      seriesColorFunc: (info: any) => getAbcQualScale(info.i_series),
      yScaleAxis: {
        tickLabelFormatter: toNum0,
      },
      xPeriodAxis: {
        calendar: getCalendar(),
      },
      content: {
        withDataLabels: false,
        lines: {
          joinAcrossGaps: false,
          defaults: {
            show: true,
          },
        },
      },
      table: {
        cellValueFormatter: (v) => toNum0(v),
      },
    };

    const figureData: ADTFigure = {
      tableData: {
        jsonArray,
        jsonDataConfig: {
          valueProps: ["count"],
          rowProp: "var_name",
        },
      },
      style,
    };
    return figureData;
  });

  return (
    <FrameLeft
    // panelChildren={
    //   <div class="ui-pad ui-spy h-full w-72 border-r border-base-300">
    //     {/* <RadioGroup
    //       label="Value"
    //       options={[
    //         { value: "count", label: "Number of records" },
    //         { value: "sum", label: "Number of service counts" },
    //       ]}
    //       value={vizConfig.value}
    //       onChange={(v) => setVizConfig("value", v as "count" | "sum")}
    //     />
    //     <RadioGroup
    //       label="Format"
    //       options={getSelectOptionsWithFirstCapital(["chart", "table"])}
    //       value={vizConfig.figureType}
    //       onChange={(v) => setVizConfig("figureType", v as "table" | "chart")}
    //     /> */}
    //     {/* <MultiSelect
    //       label="Indicators"
    //       options={p.displayItems.indicators}
    //       values={vizConfig.indicators}
    //       onChange={(v) => setVizConfig("indicators", v)}
    //       showSelectAll
    //     /> */}
    //     <Slider
    //       label={t2(T.FRENCH_UI_STRINGS.scale)}
    //       min={0.1}
    //       max={2}
    //       step={0.1}
    //       value={vizConfig.scale}
    //       onChange={(v) => setVizConfig("scale", v)}
    //       fullWidth
    //       showValueInLabel
    //     />
    //   </div>
    // }
    >
      <div class="h-full w-full">
        <TableFromCsv
          csv={csv()}
          knownTotalCount={p.displayItems.vizItems.length}
          alignText="left"
        />
        {/* <ChartHolder
          chartInputs={figureInputs()}
          height={vizConfig.figureType === "chart" ? "flex" : "ideal"}
        /> */}
      </div>
    </FrameLeft>
  );
}
