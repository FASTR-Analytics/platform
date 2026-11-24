import {
  _KEY_COLORS_DANGER,
  type DatasetHmisWindowing,
  getCalendar,
  type StructureSchema,
  t3,
} from "lib";
import {
  Checkbox,
  createQuery,
  FigureHolder,
  getTimeFromPeriodId,
  getTimeseriesDataJsonTransformed,
  MultiSelectSearch,
  StateHolderWrapper,
  type TimeseriesInputs,
  toNum0,
} from "panther";
import { batch, createMemo, onMount, Show } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { getDatasetHmisDisplayInfoFromCacheOrFetch } from "~/state/instance/t2_datasets";
import { instanceState } from "~/state/instance/t1_store";
import { indicatorPickerOptions, PeriodSelector } from "../_shared/mod.ts";

type Props = {
  hmisVersionId: number;
  countIndicatorsVersion: string;
  tempWindowing: DatasetHmisWindowing;
  setTempWindowing: SetStoreFunction<DatasetHmisWindowing>;
  structureSchema: StructureSchema;
};

export function WindowingSelector(p: Props) {
  const getIndicators = () => p.tempWindowing.indicatorsToInclude ?? [];

  const itemsHolder = createQuery(
    () =>
      getDatasetHmisDisplayInfoFromCacheOrFetch(
        p.hmisVersionId,
        p.countIndicatorsVersion,
        p.structureSchema,
        instanceState.structureLastUpdated,
        instanceState.hmisImportRunActive,
      ),
    t3({
      en: "Fetching data...",
      fr: "Récupération des données...",
      pt: "A obter dados...",
    }),
  );

  return (
    <StateHolderWrapper state={itemsHolder.state()}>
      {(keyedItemsHolder) => {
        const indicatorOptions = indicatorPickerOptions(
          keyedItemsHolder.indicators,
        );

        // Auto-correct bounds once when component mounts
        onMount(() => {
          const minBound = keyedItemsHolder.periodBounds.min;
          const maxBound = keyedItemsHolder.periodBounds.max;

          batch(() => {
            // Check and correct start bound
            if (p.tempWindowing.start < minBound) {
              p.setTempWindowing("start", minBound);
            }

            // Check and correct end bound
            if (p.tempWindowing.end > maxBound) {
              p.setTempWindowing("end", maxBound);
            }

            // Ensure start is not after end
            if (p.tempWindowing.start > p.tempWindowing.end) {
              p.setTempWindowing("start", p.tempWindowing.end);
            }
          });
        });

        const filteredVizItems = createMemo(() => {
          // Always use all items to keep chart axis stable
          return keyedItemsHolder.vizItems;
        });

        const transformedData = createMemo(() => {
          try {
            const items = filteredVizItems();
            if (items.length === 0) {
              return undefined;
            }
            return getTimeseriesDataJsonTransformed(
              filteredVizItems(),
              {
                valueProps: ["count"],
                periodProp: "period_id",
                periodType: "year-month",
                seriesProp: "indicator_common_id",
                yValueAxisLabel: t3({
                  en: "Number of facility records",
                  fr: "Nombre d'enregistrements d'établissements de santé",
                  pt: "Número de registos de estabelecimentos de saúde",
                }),
              },
              false,
            );
          } catch {
            return undefined;
          }
        });

        const figureInputs = createMemo(() => {
          try {
            const timeseriesData = transformedData();
            if (!timeseriesData) {
              return undefined;
            }

            // Use actual data range for index calculations
            const dataMinTime = timeseriesData.period.timeMin;

            // Calculate indices relative to the chart data, but offset by global bounds
            const startTime = getTimeFromPeriodId(
              p.tempWindowing.start,
              "year-month",
            );
            const endTime = getTimeFromPeriodId(
              p.tempWindowing.end,
              "year-month",
            );

            // Calculate indices based on the actual data range
            const startTimeIndex = Math.max(0, startTime - dataMinTime);
            const endTimeIndex = Math.min(
              timeseriesData.period.nTimePoints - 1,
              endTime - dataMinTime,
            );

            const takeAll = p.tempWindowing.takeAllIndicators;
            const indicators = getIndicators();

            const inputs: TimeseriesInputs = {
              figureType: "timeseries",
              data: timeseriesData,
              style: {
                text: {
                  yValueAxisLabel: {
                    relFontSize: 0.75,
                  },
                },
                surrounds: {
                  padding: { top: 20 },
                  legendPosition: "none",
                },
                yValueAxis: {
                  tickLabelFormatter: toNum0,
                },
                xPeriodAxis: {
                  calendar: getCalendar(),
                },
                content: {
                  points: {
                    func: (pointInfo) => {
                      const inPeriodRange =
                        pointInfo.i_value >= startTimeIndex &&
                        pointInfo.i_value <= endTimeIndex;

                      const inSelectedIndicators = takeAll ||
                        (pointInfo.seriesMember !== undefined &&
                          indicators.includes(pointInfo.seriesMember.label));

                      const isRed = inPeriodRange && inSelectedIndicators;
                      return isRed
                        ? {
                          show: true,
                          radius: 6,
                          color: _KEY_COLORS_DANGER,
                          innerColorStrategy: _KEY_COLORS_DANGER,
                        }
                        : {
                          show: true,
                          radius: 6,
                          innerColorStrategy: "transparent",
                        };
                    },
                  },
                },
              },
            };
            return inputs;
          } catch {
            return undefined;
          }
        });

        return (
          <div class="ui-gap flex flex-col xl:grid xl:grid-cols-12 xl:items-start xl:space-y-0">
            <div class="ui-spy-sm ui-pad flex-none rounded border xl:col-span-8">
              <div class="ui-text-heading">
                {t3({ en: "Time period", fr: "Période", pt: "Período" })}
              </div>
              <Show when={figureInputs()} keyed>
                {(figInputs) => {
                  return (
                    <FigureHolder
                      figureInputs={figInputs}
                      height={300}
                      sizing="zoom"
                    />
                  );
                }}
              </Show>
              <PeriodSelector
                periodType="year-month"
                minPeriodId={keyedItemsHolder.periodBounds.min}
                maxPeriodId={keyedItemsHolder.periodBounds.max}
                selectedStartPeriodId={p.tempWindowing.start}
                selectedEndPeriodId={p.tempWindowing.end}
                onChangeStart={(v) => p.setTempWindowing("start", v)}
                onChangeEnd={(v) => p.setTempWindowing("end", v)}
              />
            </div>
            <div class="ui-spy-sm ui-pad max-h-[600px] flex-none overflow-auto rounded border xl:col-span-4">
              <div class="ui-text-heading">
                {t3({
                  en: "Indicators",
                  fr: "Indicateurs",
                  pt: "Indicadores",
                })}
              </div>
              <Checkbox
                label={t3({
                  en: "Delete all indicators",
                  fr: "Supprimer tous les indicateurs",
                  pt: "Eliminar todos os indicadores",
                })}
                checked={p.tempWindowing.takeAllIndicators}
                onChange={(v) => p.setTempWindowing("takeAllIndicators", v)}
              />
              <Show when={!p.tempWindowing.takeAllIndicators}>
                <div class="pl-4">
                  <MultiSelectSearch
                    options={indicatorOptions}
                    values={getIndicators()}
                    onChange={(v) =>
                      p.setTempWindowing("indicatorsToInclude", v)}
                    fullWidth
                  />
                </div>
              </Show>
            </div>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}
