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
  toNum0,
  type CustomFigureStyleOptions,
  FrameTop,
  ButtonGroup,
} from "panther";
import { Show, createMemo } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { PresenceHeatMap, type HeatMapAxis } from "./presence_heat_map";

export type VizConfig = {
  value: "count" | "sum";
  figureType: "line" | "heat_map";
  indicators: string[];
  heatMapAxis: HeatMapAxis;
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
      },
    };

    const figureData: FigureInputs = {
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
    };
    return { status: "ready", data: figureData };
  });

  const isLine = () => p.vizConfig.figureType === "line";

  return (
    <FrameTop
      // startingWidth={300}
      // maxWidth={800}
      panelChildren={
        <div class="ui-pad ui-gap flex h-full w-full flex-wrap items-end">
          <div class="max-w-[600px] min-w-[300px] flex-1">
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
          <div class="ui-gap flex">
            <ButtonGroup
              label={t3({ en: "Figure", fr: "Figure", pt: "Figura" })}
              items={[
                {
                  id: "line",
                  label: t3({
                    en: "Line graph",
                    fr: "Graphique linéaire",
                    pt: "Gráfico de linhas",
                  }),
                },
                {
                  id: "heat_map",
                  label: t3({
                    en: "Heat map",
                    fr: "Carte de chaleur",
                    pt: "Mapa de calor",
                  }),
                },
              ]}
              value={p.vizConfig.figureType}
              onChange={(v) =>
                p.setVizConfig("figureType", v as VizConfig["figureType"])
              }
            />
            <Show when={isLine()}>
              <ButtonGroup
                label={t3({ en: "Value", fr: "Valeur", pt: "Valor" })}
                items={[
                  {
                    id: "count",
                    label: t3({
                      en: "Records",
                      fr: "Enregistrements",
                      pt: "Registos",
                    }),
                  },
                  {
                    id: "sum",
                    label: t3({
                      en: "Service counts",
                      fr: "Prestations de services",
                      pt: "Prestações de serviços",
                    }),
                  },
                ]}
                value={p.vizConfig.value}
                onChange={(v) => p.setVizConfig("value", v as "count" | "sum")}
              />
            </Show>
            <Show when={!isLine()}>
              <ButtonGroup
                label={t3({ en: "Periods", fr: "Périodes", pt: "Períodos" })}
                items={[
                  {
                    id: "month",
                    label: t3({
                      en: "By month",
                      fr: "Par mois",
                      pt: "Por mês",
                    }),
                  },
                  {
                    id: "year",
                    label: t3({
                      en: "By year",
                      fr: "Par année",
                      pt: "Por ano",
                    }),
                  },
                ]}
                value={p.vizConfig.heatMapAxis}
                onChange={(v) =>
                  p.setVizConfig("heatMapAxis", v as HeatMapAxis)
                }
              />
            </Show>
          </div>
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
          <Show
            when={isLine()}
            fallback={
              <PresenceHeatMap
                vizItems={filteredVizItems()}
                indicators={p.displayItems.indicators
                  .map((ind) => ind.value)
                  .filter((id) => p.vizConfig.indicators.includes(id))}
                labelReplacements={p.displayItems.indicatorLabelReplacements}
                periodBounds={p.displayItems.periodBounds}
                axis={p.vizConfig.heatMapAxis}
              />
            }
          >
            <StateHolderWrapper state={figureInputs()}>
              {(keyedInputs) => (
                <FigureHolder figureInputs={keyedInputs} height="flex" />
              )}
            </StateHolderWrapper>
          </Show>
        </Show>
      </div>
    </FrameTop>
  );
}
