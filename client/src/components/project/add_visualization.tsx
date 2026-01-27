import {
  DisaggregationOption,
  PresentationOption,
  ResultsValue,
  get_PRESENTATION_SELECT_OPTIONS,
  getStartingConfigForPresentationObject,
  isFrench,
  t,
  t2,
  T,
} from "lib";
import type { CreateModeVisualizationData } from "../visualization";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  LabelHolder,
  RadioGroup,
  Select,
  StateHolderWrapper,
  timActionForm,
  timQuery,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { serverActions } from "~/server_actions";

export function AddVisualization(
  p: AlertComponentProps<
    {
      projectId: string;
      isGlobalAdmin: boolean;
      preselectedMetric?: ResultsValue;
    },
    CreateModeVisualizationData
  >,
) {
  const metricsQuery = timQuery(
    () => p.preselectedMetric
      ? Promise.resolve({ success: true as const, data: [p.preselectedMetric] })
      : serverActions.getAllMetrics({ projectId: p.projectId }),
    "Loading...",
  );

  // Temp state

  const [tempMetricId, setTempMetricId] = createSignal<string>(p.preselectedMetric?.id ?? "");
  const [tempPresentationOption, setTempPresentationOption] = createSignal<
    PresentationOption | undefined
  >(undefined);
  const [tempDisaggregations, setTempDisaggregations] = createSignal<
    DisaggregationOption[]
  >([]);

  const readyToSave = () => tempMetricId() && tempPresentationOption();

  const selectedMetric = (): ResultsValue | undefined => {
    const metrics = metricsQuery.state();
    if (metrics.status !== "ready") {
      return;
    }
    return metrics.data.find((m) => m.id === tempMetricId());
  };

  // Actions

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const metric = selectedMetric();
      if (!metric) {
        return {
          success: false,
          err: t("You must select a metric"),
        };
      }

      const presentationOption = tempPresentationOption();
      if (!presentationOption) {
        return {
          success: false,
          err: t("You must select a presentation option"),
        };
      }

      const disaggregations = metric.disaggregationOptions
        .filter(
          (disOpt) =>
            disOpt.isRequired || tempDisaggregations().includes(disOpt.value),
        )
        .filter(
          (disOpt) =>
            !disOpt.allowedPresentationOptions ||
            disOpt.allowedPresentationOptions.includes(presentationOption),
        )
        .map((disOpt) => disOpt.value);

      const config = getStartingConfigForPresentationObject(
        metric,
        presentationOption,
        disaggregations,
      );

      return {
        success: true,
        data: {
          label: metric.label.trim(),
          resultsValue: metric,
          config,
        } satisfies CreateModeVisualizationData,
      };
    },
    (data) => {
      p.close(data);
    },
  );

  return (
    <AlertFormHolder
      formId="add-presentation-object"
      header={t2(T.FRENCH_UI_STRINGS.create_new_visualization)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      wider
      disableSaveButton={!readyToSave()}
      french={isFrench()}
    >
      <StateHolderWrapper state={metricsQuery.state()} noPad>
        {(metrics) => {
          return (
            <>
              <Show
                when={metrics.length > 0}
                fallback={t(
                  "You need to enable at least one module in order to create visualizations",
                )}
              >
                <Show when={!p.preselectedMetric}>
                  <RadioGroup
                    label={t("Metric")}
                    options={metrics.map((m) => ({
                      value: m.id,
                      label: m.label,
                    }))}
                    value={tempMetricId()}
                    onChange={(v) => {
                      setTempMetricId(v);
                      setTempDisaggregations([]);
                    }}
                    convertToSelectThreshold={6}
                    fullWidthForSelect
                  />
                </Show>
                <Show when={p.preselectedMetric}>
                  <div class="text-sm">
                    <span class="text-neutral">{t("Metric")}:</span>{" "}
                    <span class="font-700">{p.preselectedMetric!.label}</span>
                  </div>
                </Show>
              </Show>
              <Show when={selectedMetric()} keyed>
                {(metric) => {
                  return (
                    <>
                      <RadioGroup
                        label={t2(T.FRENCH_UI_STRINGS.present_as)}
                        options={get_PRESENTATION_SELECT_OPTIONS()}
                        value={tempPresentationOption()}
                        onChange={setTempPresentationOption}
                      />
                      <Show when={tempPresentationOption()} keyed>
                        {(selectedPresentationOption) => {
                          return (
                            <LabelHolder
                              label={t2(T.FRENCH_UI_STRINGS.disaggregate_by)}
                            >
                              <div class="space-y-1">
                                <For
                                  each={metric.disaggregationOptions.filter(
                                    (disOpt) =>
                                      !disOpt.allowedPresentationOptions ||
                                      disOpt.allowedPresentationOptions.includes(
                                        selectedPresentationOption,
                                      ),
                                  )}
                                >
                                  {(disOpt) => {
                                    return (
                                      <Switch>
                                        <Match when={!disOpt.isRequired}>
                                          <Checkbox
                                            label={t2(disOpt.label)}
                                            checked={tempDisaggregations().includes(
                                              disOpt.value,
                                            )}
                                            onChange={(checked) => {
                                              setTempDisaggregations((prev) => {
                                                if (checked) {
                                                  return [
                                                    ...prev,
                                                    disOpt.value,
                                                  ];
                                                } else {
                                                  return prev.filter(
                                                    (d) => d !== disOpt.value,
                                                  );
                                                }
                                              });
                                            }}
                                          />
                                        </Match>
                                        <Match when={disOpt.isRequired}>
                                          <Checkbox
                                            label={
                                              <>
                                                {t2(disOpt.label)}
                                                <span class="ml-1 text-xs">
                                                  (
                                                  {t(
                                                    "Required for this visualization",
                                                  )}
                                                  )
                                                </span>
                                              </>
                                            }
                                            checked={true}
                                            onChange={() => { }}
                                            disabled={true}
                                          />
                                        </Match>
                                      </Switch>
                                    );
                                  }}
                                </For>
                              </div>
                            </LabelHolder>
                          );
                        }}
                      </Show>
                    </>
                  );
                }}
              </Show>
            </>
          );
        }}
      </StateHolderWrapper>
    </AlertFormHolder>
  );
}
