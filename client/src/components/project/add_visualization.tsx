import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  DisaggregationOption,
  PresentationOption,
  get_PRESENTATION_SELECT_OPTIONS,
  getMetricDisplayLabel,
  getMetricStaticData,
  getStartingConfigForPresentationObject,
  groupMetricsByLabel,
  isFrench,
  t,
  t2,
  T,
  type CreateModeVisualizationData,
  type MetricWithStatus,
  type PresentationObjectConfig,
} from "lib";
import {
  AlertComponentProps,
  AlertFormHolder,
  Checkbox,
  LabelHolder,
  RadioGroup,
  timActionForm,
} from "panther";
import { For, Match, Show, Switch, createSignal } from "solid-js";
import { PresetSelector } from "./preset_preview";

type AddVisualizationProps = {
  projectId: string;
  isGlobalAdmin: boolean;
} & (
    | { preselectedMetric: MetricWithStatus }
    | { metrics: MetricWithStatus[] }
  );

const CUSTOM_OPTION = "__custom__";

export function AddVisualization(
  p: AlertComponentProps<AddVisualizationProps, CreateModeVisualizationData>,
) {
  const preselectedMetric = "preselectedMetric" in p ? p.preselectedMetric : undefined;

  const metricGroups = () =>
    "metrics" in p ? groupMetricsByLabel(p.metrics, { onlyReady: true }) : [];

  const [selectedGroupLabel, setSelectedGroupLabel] = createSignal<string>("");
  const [selectedMetricId, setSelectedMetricId] = createSignal<string>(
    preselectedMetric?.id ?? ""
  );
  const [selectedVizPresetId, setSelectedVizPresetId] = createSignal<string | undefined>(undefined);
  const [tempPresentationOption, setTempPresentationOption] = createSignal<
    PresentationOption | undefined
  >(undefined);
  const [tempDisaggregations, setTempDisaggregations] = createSignal<
    DisaggregationOption[]
  >([]);

  const selectedGroup = () =>
    metricGroups().find((g) => g.label === selectedGroupLabel());

  const selectedMetric = (): MetricWithStatus | undefined => {
    if (preselectedMetric) return preselectedMetric;
    const group = selectedGroup();
    if (!group) return undefined;
    return group.variants.find((m) => m.id === selectedMetricId());
  };

  const vizPresets = () => {
    const id = selectedMetricId();
    if (!id) return [];
    try {
      return getMetricStaticData(id).vizPresets ?? [];
    } catch {
      return [];
    }
  };

  const isPresetSelected = () => {
    const id = selectedVizPresetId();
    return id !== undefined && id !== CUSTOM_OPTION;
  };

  const readyToSave = () => selectedMetricId() && (isPresetSelected() || tempPresentationOption());

  const resetSelections = () => {
    setSelectedVizPresetId(undefined);
    setTempPresentationOption(undefined);
    setTempDisaggregations([]);
  };

  const save = timActionForm(
    async (e: MouseEvent) => {
      e.preventDefault();
      const metric = selectedMetric();
      if (!metric) {
        return { success: false, err: t("You must select a metric") };
      }

      const presetId = selectedVizPresetId();
      if (presetId && presetId !== CUSTOM_OPTION) {
        const presets = vizPresets();
        const preset = presets.find(p => p.id === presetId);
        if (!preset) {
          return { success: false, err: "Invalid preset" };
        }

        const config: PresentationObjectConfig = {
          d: { ...preset.config.d },
          s: { ...DEFAULT_S_CONFIG, ...preset.config.s },
          t: { ...DEFAULT_T_CONFIG, ...preset.config.t },
        };

        return {
          success: true,
          data: {
            label: metric.label.trim(),
            resultsValue: metric,
            config,
          } satisfies CreateModeVisualizationData,
        };
      }

      const presentationOption = tempPresentationOption();
      if (!presentationOption) {
        return { success: false, err: t("You must select a presentation option") };
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
      header={t2(T.FRENCH_UI_STRINGS.create_visualization)}
      savingState={save.state()}
      saveFunc={save.click}
      cancelFunc={() => p.close(undefined)}
      width="lg"
      disableSaveButton={!readyToSave()}
      french={isFrench()}
    >
      <Show when={preselectedMetric}>
        <div class="text-sm">
          <span class="text-neutral">{t("Metric")}:</span>{" "}
          <span class="font-700">{getMetricDisplayLabel(preselectedMetric!)}</span>
        </div>
      </Show>
      <Show
        when={!preselectedMetric && metricGroups().length > 0}
        fallback={
          !preselectedMetric
            ? t("You need to enable at least one module in order to create visualizations")
            : null
        }
      >
        <RadioGroup
          label={t("Metric")}
          options={metricGroups().map((g) => ({
            value: g.label,
            label: g.label,
          }))}
          value={selectedGroupLabel()}
          onChange={(v) => {
            setSelectedGroupLabel(v);
            const group = metricGroups().find((g) => g.label === v);
            if (group?.variants.length === 1) {
              setSelectedMetricId(group.variants[0].id);
            } else {
              setSelectedMetricId("");
            }
            resetSelections();
          }}
          convertToSelectThreshold={6}
          fullWidthForSelect
          placeholderForSelect="Choose a metric..."
        />
        <Show when={selectedGroup() && selectedGroup()!.variants.length > 1}>
          <RadioGroup
            label={t("Variant")}
            options={selectedGroup()!.variants.map((m) => ({
              value: m.id,
              label: m.variantLabel || t("Default"),
            }))}
            value={selectedMetricId()}
            onChange={(v) => {
              setSelectedMetricId(v);
              resetSelections();
            }}
          />
        </Show>
      </Show>
      <Show when={selectedMetric()} keyed>
        {(metric) => {
          const presets = vizPresets();
          const hasPresets = presets.length > 0;

          return (
            <>
              <Show when={hasPresets}>
                <PresetSelector
                  projectId={p.projectId}
                  metric={metric}
                  presets={presets}
                  selectedId={selectedVizPresetId()}
                  onSelect={(id) => {
                    setSelectedVizPresetId(id);
                    setTempPresentationOption(undefined);
                    setTempDisaggregations([]);
                  }}
                />
              </Show>

              <Show when={!hasPresets || selectedVizPresetId() === CUSTOM_OPTION}>
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
              </Show>
            </>
          );
        }}
      </Show>
    </AlertFormHolder>
  );
}
