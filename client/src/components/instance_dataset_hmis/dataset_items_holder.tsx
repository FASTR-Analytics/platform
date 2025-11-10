import {
  ItemsHolderDatasetHmisDisplay,
  getAbcQualScale,
  getCalendar,
  t,
  t2,
  T,
  type IndicatorType,
  type InstanceConfigFacilityColumns,
} from "lib";
import {
  ADTFigure,
  ChartHolder,
  FrameLeft,
  FrameLeftResizable,
  MultiSelect,
  RadioGroup,
  Slider,
  StateHolder,
  StateHolderWrapper,
  getSelectOptionsWithFirstCapital,
  toNum0,
  type APIResponseWithData,
  type CustomFigureStyleOptions,
} from "panther";
import {
  Show,
  createEffect,
  createMemo,
  createSignal,
  type Setter,
} from "solid-js";
import { createStore } from "solid-js/store";
import { getDatasetHmisDisplayInfoFromCacheOrFetch } from "~/state/dataset_cache";

type Props = {
  versionId: number;
  indicatorMappingsVersion: string;
  facilityColumns: InstanceConfigFacilityColumns;
};

export function DatasetItemsHolder(p: Props) {
  const [rawOrCommon, setRawOrCommon] = createSignal<IndicatorType>("common");
  // console.log(p.versionId);

  const [itemsHolder, setItemsHolder] = createSignal<
    StateHolder<ItemsHolderDatasetHmisDisplay>
  >({
    status: "loading",
    msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
  });

  async function attemptGetDatatable(
    rawOrCommonIndicators: IndicatorType,
    versionId: number,
    indicatorMappingsVersion: string,
  ) {
    setItemsHolder({
      status: "loading",
      msg: t2(T.FRENCH_UI_STRINGS.fetching_data),
    });
    const res = await getDatasetHmisDisplayInfoFromCacheOrFetch(
      rawOrCommonIndicators,
      versionId,
      indicatorMappingsVersion,
      p.facilityColumns,
    );
    if (res.success === false) {
      setItemsHolder({ status: "error", err: res.err });
      return;
    }
    // if (res.data.vizItems.length === 0) {
    //   setItemsHolder({
    //     status: "error",
    //     err: "There is no data to display. Import some data.",
    //   });
    //   return;
    // }
    setItemsHolder({
      status: "ready",
      data: res.data,
    });
  }

  createEffect(() => {
    attemptGetDatatable(rawOrCommon(), p.versionId, p.indicatorMappingsVersion);
  });

  return (
    <StateHolderWrapper state={itemsHolder()}>
      {(keyedDatasetItems) => {
        return (
          <DatasetDisplayPresentation
            displayItems={keyedDatasetItems}
            rawOrCommon={rawOrCommon()}
            setRawOrCommon={setRawOrCommon}
          />
        );
      }}
    </StateHolderWrapper>
  );
}

type DatasetDisplayPresentationProps = {
  displayItems: ItemsHolderDatasetHmisDisplay;
  rawOrCommon: IndicatorType;
  setRawOrCommon: Setter<IndicatorType>;
};

function DatasetDisplayPresentation(p: DatasetDisplayPresentationProps) {
  const [vizConfig, setVizConfig] = createStore({
    value: "count" as "count" | "sum",
    figureType: "chart" as "table" | "chart",
    scale: 1,
    indicators: p.displayItems.indicators.map((ind) => ind.value),
  });

  const filteredVizItems = createMemo(() => {
    const indicatorsToVizualize = vizConfig.indicators;
    if (p.displayItems.indicators.length === indicatorsToVizualize.length) {
      return p.displayItems.vizItems;
    }
    return p.displayItems.vizItems.filter((row) => {
      return indicatorsToVizualize?.includes(row["indicator_id"]) ?? true;
    });
  });

  const figureInputs = createMemo<StateHolder<ADTFigure>>(() => {
    const jsonArray = filteredVizItems();

    const value = vizConfig.value;
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

    const figureData: ADTFigure =
      figureType === "chart"
        ? {
            timeseriesData: {
              jsonArray,
              jsonDataConfig: {
                valueProps: [value],
                periodProp: "period_id",
                periodType: "year-month",
                seriesProp: "indicator_id",
                labelReplacementsBeforeSorting:
                  p.displayItems.indicatorLabelReplacements,
                yScaleAxisLabel:
                  value === "count"
                    ? t2(T.FRENCH_UI_STRINGS.number_of_records)
                    : t("Number of service counts"),
              },
            },
            style,
          }
        : {
            tableData: {
              jsonArray,
              jsonDataConfig: {
                valueProps: [value],
                colProp: "indicator_id",
                rowProp: "period_id",
                sortHeaders: true,
                labelReplacementsBeforeSorting:
                  p.displayItems.indicatorLabelReplacements,
              },
            },
            style,
          };
    return { status: "ready", data: figureData };
  });

  return (
    <FrameLeftResizable
      startingWidth={300}
      maxWidth={800}
      panelChildren={
        <div class="ui-pad ui-spy border-base-300 h-full w-full border-r">
          <RadioGroup
            label="Common or DHIS2 indicators"
            options={[
              { value: "common", label: "Common indicators" },
              { value: "raw", label: "DHIS2 indicators" },
            ]}
            value={p.rawOrCommon}
            onChange={(v) => p.setRawOrCommon(v as IndicatorType)}
          />
          <RadioGroup
            label="Value"
            options={[
              { value: "count", label: "Number of records" },
              { value: "sum", label: "Number of service counts" },
            ]}
            value={vizConfig.value}
            onChange={(v) => setVizConfig("value", v as "count" | "sum")}
          />
          <RadioGroup
            label="Format"
            options={getSelectOptionsWithFirstCapital(["chart", "table"])}
            value={vizConfig.figureType}
            onChange={(v) => setVizConfig("figureType", v as "table" | "chart")}
          />
          <MultiSelect
            label="Indicators"
            options={p.displayItems.indicators}
            values={vizConfig.indicators}
            onChange={(v) => setVizConfig("indicators", v)}
            showSelectAll
          />
          <Slider
            label={t2(T.FRENCH_UI_STRINGS.scale)}
            min={0.1}
            max={2}
            step={0.1}
            value={vizConfig.scale}
            onChange={(v) => setVizConfig("scale", v)}
            fullWidth
            showValueInLabel
          />
        </div>
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <Show
          when={vizConfig.indicators.length > 0}
          fallback={
            <span class="text-sm">You must select at least one indicator</span>
          }
        >
          <StateHolderWrapper state={figureInputs()}>
            {(keyedInputs) => {
              return (
                <ChartHolder
                  chartInputs={keyedInputs}
                  height={vizConfig.figureType === "chart" ? "flex" : "ideal"}
                />
              );
            }}
          </StateHolderWrapper>
        </Show>
      </div>
    </FrameLeftResizable>
  );
}
