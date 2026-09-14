import {
  ItemsHolderDatasetHmisDisplay,
  getAbcQualScale,
  getCalendar,
  t3,
} from "lib";
import {
  FigureInputs,
  FigureHolder,
  FrameLeftResizable,
  MultiSelectSearch,
  RadioGroup,
  StateHolder,
  StateHolderWrapper,
  getSelectOptionsWithFirstCapital,
  toNum0,
  type CustomFigureStyleOptions,
} from "panther";
import { Show, createMemo } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";

export type VizConfig = {
  value: "count" | "sum";
  figureType: "table" | "chart";
  indicators: string[];
};

type Props = {
  displayItems: ItemsHolderDatasetHmisDisplay;
  vizConfig: VizConfig;
  setVizConfig: SetStoreFunction<VizConfig>;
};

// One view, by the indicators that have rows (PLAN_A4 ruling 8): sums have
// no rows and do not appear; their totals are in packages. The page owns
// the fetch and the store (PLAN_A8 ruling 10); this is the render over them.
export function DatasetDisplayPresentation(p: Props) {
  const filteredVizItems = createMemo(() => {
    const indicatorsToVizualize = p.vizConfig.indicators;
    if (p.displayItems.indicators.length === indicatorsToVizualize.length) {
      return p.displayItems.vizItems;
    }
    return p.displayItems.vizItems.filter((row) =>
      indicatorsToVizualize.includes(row["indicator_common_id"]),
    );
  });

  const figureInputs = createMemo<StateHolder<FigureInputs>>(() => {
    const jsonArray = filteredVizItems();

    const value = p.vizConfig.value;
    const figureType = p.vizConfig.figureType;

    const showLegend =
      p.vizConfig.indicators.length > 0 && p.vizConfig.indicators.length < 6;

    const style: CustomFigureStyleOptions = {
      surrounds: {
        legendPosition: showLegend ? undefined : "none",
      },
      legend: {
        maxLegendItemsInOneColumn: 1,
      },
      seriesColorFunc: (info: any) => getAbcQualScale(info.i_series),
      yScaleAxis: {
        tickLabelFormatter: toNum0,
      },
      xPeriodAxis: {
        calendar: getCalendar(),
      },
      content: {
        lines: {
          joinAcrossGaps: false,
          func: {
            show: true,
            color: showLegend ? 666 : { key: "base300" },
          },
        },
        tableCells: {
          textFormatter: (info) => toNum0(info.value),
        },
      },
    };

    const figureData: FigureInputs =
      figureType === "chart"
        ? {
            figureType: "timeseries",
            data: {
              jsonArray,
              jsonDataConfig: {
                valueProps: [value],
                periodProp: "period_id",
                periodType: "year-month",
                seriesProp: "indicator_common_id",
                labelReplacements: p.displayItems.indicatorLabelReplacements,
                yScaleAxisLabel:
                  value === "count"
                    ? t3({
                        en: "Number of records",
                        fr: "Nombre d'enregistrements",
                        pt: "Número de registos",
                      })
                    : t3({
                        en: "Number of service counts",
                        fr: "Nombre de prestations de services",
                        pt: "Número de prestações de serviços",
                      }),
              },
            },
            style,
          }
        : {
            figureType: "table",
            data: {
              jsonArray,
              jsonDataConfig: {
                valueProps: [value],
                colProp: "indicator_common_id",
                rowProp: "period_id",
                sort: { col: "by-label", row: "by-label" },
                labelReplacements: p.displayItems.indicatorLabelReplacements,
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
        <div class="ui-pad ui-spy h-full w-full">
          <RadioGroup
            label={t3({ en: "Value", fr: "Valeur", pt: "Valor" })}
            options={[
              {
                value: "count",
                label: t3({
                  en: "Number of records",
                  fr: "Nombre d'enregistrements",
                  pt: "Número de registos",
                }),
              },
              {
                value: "sum",
                label: t3({
                  en: "Number of service counts",
                  fr: "Nombre de prestations de services",
                  pt: "Número de prestações de serviços",
                }),
              },
            ]}
            value={p.vizConfig.value}
            onChange={(v) => p.setVizConfig("value", v as "count" | "sum")}
          />
          <RadioGroup
            label={t3({ en: "Format", fr: "Format", pt: "Formato" })}
            options={getSelectOptionsWithFirstCapital(["chart", "table"])}
            value={p.vizConfig.figureType}
            onChange={(v) => p.setVizConfig("figureType", v as "table" | "chart")}
          />
          <MultiSelectSearch
            label={t3({
              en: "Indicators",
              fr: "Indicateurs",
              pt: "Indicadores",
            })}
            options={p.displayItems.indicators}
            values={p.vizConfig.indicators}
            onChange={(v) => p.setVizConfig("indicators", v)}
            fullWidth
          />
        </div>
      }
    >
      <div class="ui-pad h-full w-full overflow-auto">
        <Show
          when={p.vizConfig.indicators.length > 0}
          fallback={
            <span class="text-sm">
              {t3({
                en: "You must select at least one indicator",
                fr: "Vous devez sélectionner au moins un indicateur",
                pt: "Tem de selecionar pelo menos um indicador",
              })}
            </span>
          }
        >
          <StateHolderWrapper state={figureInputs()}>
            {(keyedInputs) => {
              return (
                <FigureHolder
                  figureInputs={keyedInputs}
                  height={p.vizConfig.figureType === "chart" ? "flex" : "ideal"}
                />
              );
            }}
          </StateHolderWrapper>
        </Show>
      </div>
    </FrameLeftResizable>
  );
}
