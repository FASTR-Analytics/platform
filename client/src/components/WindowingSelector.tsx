import {
  _COLOR_WATERMARK_GREY,
  _KEY_COLORS_DANGER,
  _KEY_COLORS_SUCCESS,
  getCalendar,
  makeAa3CompositeKey,
  t3,
  type DatasetHmisWindowing,
  type DatasetHmisWindowingRaw,
  type InstanceConfigFacilityColumns,
  type TranslatableString,
} from "lib";
import {
  ChartHolder,
  Checkbox,
  MultiSelect,
  NestedMultiSelect,
  StateHolderWrapper,
  getSelectOptions,
  getTimeFromPeriodId,
  getTimeseriesDataJsonTransformed,
  timQuery,
  toNum0,
  type NestedSelectLeafNode,
  type NestedSelectNode,
  type SelectOption,
  type TimeseriesInputs,
} from "panther";
import { Show, batch, createMemo, onMount } from "solid-js";
import type { SetStoreFunction } from "solid-js/store";
import { getDatasetHmisDisplayInfoFromCacheOrFetch } from "~/state/dataset_cache";
import { instanceState } from "~/state/instance_state";
import { PeriodSelector } from "./PeriodSelector";

type Props<T extends DatasetHmisWindowing> = {
  hmisVersionId: number;
  indicatorMappingsVersion: string;
  tempWindowing: T;
  setTempWindowing: SetStoreFunction<T>;
  facilityColumns: InstanceConfigFacilityColumns;
  includeOrDelete: "include" | "delete";
};

export function WindowingSelector<T extends DatasetHmisWindowing>(p: Props<T>) {
  const isRawIndicators = (
    w: DatasetHmisWindowing,
  ): w is DatasetHmisWindowingRaw => w.indicatorType === "raw";

  const getIndicators = () => {
    if (isRawIndicators(p.tempWindowing)) {
      return p.tempWindowing.rawIndicatorsToInclude ?? [];
    } else {
      return p.tempWindowing.commonIndicatorsToInclude ?? [];
    }
  };

  const setIndicators = (values: string[]) => {
    if (isRawIndicators(p.tempWindowing)) {
      (p.setTempWindowing as SetStoreFunction<DatasetHmisWindowingRaw>)(
        "rawIndicatorsToInclude",
        values,
      );
    } else {
      (p.setTempWindowing as any)("commonIndicatorsToInclude", values);
    }
  };

  const itemsHolder = timQuery(
    () =>
      getDatasetHmisDisplayInfoFromCacheOrFetch(
        p.tempWindowing.indicatorType,
        p.hmisVersionId,
        p.indicatorMappingsVersion,
        p.facilityColumns,
        instanceState.maxAdminArea,
      ),
    t3({ en: "Fetching data...", fr: "Récupération des données..." }),
  );

  return (
    <StateHolderWrapper state={itemsHolder.state()} noPad>
      {(keyedItemsHolder) => {
        // console.log(keyedItemsHolder);
        const isDelete = p.includeOrDelete === "delete";

        const adminAreaTree = createMemo(() => {
          const aa3s = keyedItemsHolder.adminArea3s;
          if (!aa3s || aa3s.length === 0) return undefined;
          const grouped = new Map<
            string,
            { admin_area_3: string; admin_area_2: string }[]
          >();
          for (const item of aa3s) {
            const list = grouped.get(item.admin_area_2) ?? [];
            list.push(item);
            grouped.set(item.admin_area_2, list);
          }
          const nodes: NestedSelectNode<string>[] = [];
          for (const [aa2, districts] of grouped) {
            nodes.push({
              key: aa2,
              label: aa2,
              children: districts.map(
                (d): NestedSelectLeafNode<string> => ({
                  key: makeAa3CompositeKey(d.admin_area_3, d.admin_area_2),
                  label: d.admin_area_3,
                  value: makeAa3CompositeKey(d.admin_area_3, d.admin_area_2),
                }),
              ),
            });
          }
          return nodes;
        });

        // Auto-correct bounds once when component mounts
        onMount(() => {
          const minBound = keyedItemsHolder.periodBounds.min;
          const maxBound = keyedItemsHolder.periodBounds.max;

          batch(() => {
            // Check and correct start bound
            if (p.tempWindowing.start < minBound) {
              (p.setTempWindowing as any)("start", minBound);
            }

            // Check and correct end bound
            if (p.tempWindowing.end > maxBound) {
              (p.setTempWindowing as any)("end", maxBound);
            }

            // Ensure start is not after end
            if (p.tempWindowing.start > p.tempWindowing.end) {
              (p.setTempWindowing as any)("start", p.tempWindowing.end);
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
                seriesProp: "indicator_id",
                yScaleAxisLabel: t3({ en: "Number of facility records", fr: "Nombre d'enregistrements d'établissements de santé" }),
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
            const dataMinTime = timeseriesData.timeMin;

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
              timeseriesData.nTimePoints - 1,
              endTime - dataMinTime,
            );

            const takeAll = p.tempWindowing.takeAllIndicators;
            const indicators = getIndicators();

            const inputs: TimeseriesInputs = {
              timeseriesData: timeseriesData,
              style: {
                scale: 0.6,
                text: {
                  yScaleAxisLabel: {
                    relFontSize: 0.75,
                  },
                },
                surrounds: {
                  padding: { top: 20 },
                  legendPosition: "none",
                },
                yScaleAxis: {
                  tickLabelFormatter: toNum0,
                },
                xPeriodAxis: {
                  calendar: getCalendar(),
                },
                content: {
                  points: {
                    func: !isDelete
                      ? (pointInfo) => {
                          const inPeriodRange =
                            pointInfo.i_val >= startTimeIndex &&
                            pointInfo.i_val <= endTimeIndex;

                          const inSelectedIndicators =
                            takeAll ||
                            indicators.includes(pointInfo.seriesHeader);

                          const isGreen = inPeriodRange && inSelectedIndicators;
                          return isGreen
                            ? {
                                show: true,
                                radius: 6,
                                color: _KEY_COLORS_SUCCESS,
                                innerColorStrategy: _KEY_COLORS_SUCCESS,
                              }
                            : {
                                show: true,
                                radius: 6,
                                color: _COLOR_WATERMARK_GREY,
                                innerColorStrategy: "transparent",
                              };
                        }
                      : (pointInfo) => {
                          const inPeriodRange =
                            pointInfo.i_val >= startTimeIndex &&
                            pointInfo.i_val <= endTimeIndex;

                          const inSelectedIndicators =
                            takeAll ||
                            indicators.includes(pointInfo.seriesHeader);

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
            <div class="ui-spy-sm ui-pad border-base-300 flex-none rounded border xl:col-span-8">
              <div class="text-md font-700">
                {t3({ en: "Time period", fr: "Période" })}
              </div>
              <Show when={figureInputs()} keyed>
                {(figInputs) => {
                  return <ChartHolder chartInputs={figInputs} height={300} />;
                }}
              </Show>
              <PeriodSelector
                periodType="year-month"
                minPeriodId={keyedItemsHolder.periodBounds.min}
                maxPeriodId={keyedItemsHolder.periodBounds.max}
                selectedStartPeriodId={p.tempWindowing.start}
                selectedEndPeriodId={p.tempWindowing.end}
                onChangeStart={(v) => (p.setTempWindowing as any)("start", v)}
                onChangeEnd={(v) => (p.setTempWindowing as any)("end", v)}
              />
            </div>
            <ToggledMultiSelect
              heading={{ en: "Indicators", fr: "Indicateurs" }}
              toggleAllLabel={isDelete ? { en: "Delete all indicators", fr: "Supprimer tous les indicateurs" } : { en: "Include all indicators", fr: "Inclure tous les indicateurs" }}
              takeAll={p.tempWindowing.takeAllIndicators}
              setTakeAll={(v) =>
                (p.setTempWindowing as any)("takeAllIndicators", v)
              }
              itemOptions={keyedItemsHolder.indicators}
              itemsToTake={getIndicators()}
              setItemsToTake={setIndicators}
              isDelete={isDelete}
            />
            <Show when={!isDelete}>
              <Show
                when={adminAreaTree()}
                fallback={
                  <ToggledMultiSelect
                    heading={{ en: "Admin areas", fr: "Unités administratives" }}
                    toggleAllLabel={{ en: "Include all admin areas", fr: "Inclure toutes les unités administratives" }}
                    takeAll={p.tempWindowing.takeAllAdminArea2s}
                    setTakeAll={(v) =>
                      (p.setTempWindowing as any)("takeAllAdminArea2s", v)
                    }
                    itemOptions={getSelectOptions(keyedItemsHolder.adminArea2s)}
                    itemsToTake={p.tempWindowing.adminArea2sToInclude}
                    setItemsToTake={(v) =>
                      (p.setTempWindowing as any)("adminArea2sToInclude", v)
                    }
                    isDelete={isDelete}
                  />
                }
              >
                {(tree) => (
                  <ToggledNestedMultiSelect
                    heading={{ en: "Admin areas", fr: "Unités administratives" }}
                    toggleAllLabel={{ en: "Include all admin areas", fr: "Inclure toutes les unités administratives" }}
                    takeAll={p.tempWindowing.takeAllAdminArea3s ?? true}
                    setTakeAll={(v) =>
                      (p.setTempWindowing as any)("takeAllAdminArea3s", v)
                    }
                    nodes={tree()}
                    itemsToTake={p.tempWindowing.adminArea3sToInclude ?? []}
                    setItemsToTake={(v) =>
                      (p.setTempWindowing as any)("adminArea3sToInclude", v)
                    }
                  />
                )}
              </Show>
            </Show>
            <Show when={!isDelete && p.facilityColumns.includeOwnership}>
              <ToggledMultiSelect
                heading={{ en: "Facility ownership categories", fr: "Catégories de propriété des établissements" }}
                toggleAllLabel={{ en: "Include all facility ownership categories", fr: "Inclure toutes les catégories de propriété" }}
                takeAll={p.tempWindowing.takeAllFacilityOwnerships ?? true}
                setTakeAll={(v) =>
                  (p.setTempWindowing as any)("takeAllFacilityOwnerships", v)
                }
                itemOptions={getSelectOptions(
                  keyedItemsHolder.facilityOwnership ?? [],
                )}
                itemsToTake={p.tempWindowing.facilityOwnwershipsToInclude ?? []}
                setItemsToTake={(v) =>
                  (p.setTempWindowing as any)("facilityOwnwershipsToInclude", v)
                }
                isDelete={isDelete}
              />
            </Show>
            <Show when={!isDelete && p.facilityColumns.includeTypes}>
              <ToggledMultiSelect
                heading={{ en: "Facility types", fr: "Types d'établissements" }}
                toggleAllLabel={{ en: "Include all facility types", fr: "Inclure tous les types d'établissements" }}
                takeAll={p.tempWindowing.takeAllFacilityTypes ?? true}
                setTakeAll={(v) =>
                  (p.setTempWindowing as any)("takeAllFacilityTypes", v)
                }
                itemOptions={getSelectOptions(
                  keyedItemsHolder.facilityTypes ?? [],
                )}
                itemsToTake={p.tempWindowing.facilityTypesToInclude ?? []}
                setItemsToTake={(v) =>
                  (p.setTempWindowing as any)("facilityTypesToInclude", v)
                }
                isDelete={isDelete}
              />
            </Show>
          </div>
        );
      }}
    </StateHolderWrapper>
  );
}

type ToggledMultiSelectProps = {
  isDelete: boolean;
  takeAll: boolean;
  heading: TranslatableString;
  toggleAllLabel: TranslatableString;
  itemOptions: SelectOption<string>[];
  itemsToTake: string[];
  setTakeAll: (v: boolean) => void;
  setItemsToTake: (v: string[]) => void;
};

function ToggledMultiSelect(p: ToggledMultiSelectProps) {
  return (
    <div class="ui-spy-sm ui-pad border-base-300 max-h-[600px] flex-none overflow-auto rounded border xl:col-span-4">
      <div class="text-md font-700">
        {t3(p.heading)}
      </div>
      <Checkbox
        label={t3(p.toggleAllLabel)}
        checked={p.takeAll}
        onChange={p.setTakeAll}
      />
      <Show when={!p.takeAll}>
        <div class="pl-4">
          <MultiSelect
            options={p.itemOptions}
            values={p.itemsToTake}
            onChange={p.setItemsToTake}
          />
        </div>
      </Show>
    </div>
  );
}

type ToggledNestedMultiSelectProps = {
  heading: TranslatableString;
  toggleAllLabel: TranslatableString;
  takeAll: boolean;
  setTakeAll: (v: boolean) => void;
  nodes: NestedSelectNode<string>[];
  itemsToTake: string[];
  setItemsToTake: (v: string[]) => void;
};

function ToggledNestedMultiSelect(p: ToggledNestedMultiSelectProps) {
  return (
    <div class="ui-spy-sm ui-pad border-base-300 max-h-[600px] flex-none overflow-auto rounded border xl:col-span-4">
      <div class="text-md font-700">
        {t3(p.heading)}
      </div>
      <Checkbox
        label={t3(p.toggleAllLabel)}
        checked={p.takeAll}
        onChange={p.setTakeAll}
      />
      <Show when={!p.takeAll}>
        <div class="pl-4">
          <NestedMultiSelect
            nodes={p.nodes}
            values={p.itemsToTake}
            onChange={p.setItemsToTake}
          />
        </div>
      </Show>
    </div>
  );
}
