import {
  DisaggregationOption,
  getModuleIdForMetric,
  PresentationOption,
  ResultsValue,
  get_PRESENTATION_SELECT_OPTIONS,
  isFrench,
  t,
  t2,
  T,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  LabelHolder,
  RadioGroup,
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
    },
    { moduleId: string; newPresentationObjectId: string; lastUpdated: string }
  >,
) {
  const metricsQuery = timQuery(
    () => serverActions.getAllMetrics({ projectId: p.projectId }),
    "Loading...",
  );

  // Temp state

  const [tempMetricId, setTempMetricId] = createSignal<string>("");
  const [tempPresentationOption, setTempPresentationOption] = createSignal<
    PresentationOption | undefined
  >(undefined);
  const [tempDisaggregations, setTempDisaggregations] = createSignal<
    DisaggregationOption[]
  >([]);
  const [tempMakeDefault, setTempMakeDefault] = createSignal<boolean>(false);

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

      return serverActions.createPresentationObject({
        projectId: p.projectId,
        label: metric.label.trim(),
        resultsValue: metric,
        presentationOption,
        disaggregations,
        makeDefault: p.isGlobalAdmin && tempMakeDefault(),
      });
    },
    (data) => {
      const metric = selectedMetric();
      if (metric) {
        p.close({
          moduleId: getModuleIdForMetric(metric.id),
          newPresentationObjectId: data.newPresentationObjectId,
          lastUpdated: data.lastUpdated,
        });
      }
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
                />
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
                                            onChange={() => {}}
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
