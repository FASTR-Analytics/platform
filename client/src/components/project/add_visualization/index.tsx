import {
  DEFAULT_S_CONFIG,
  DEFAULT_T_CONFIG,
  getStartingConfigForPresentationObject,
  t3,
  type CreateModeVisualizationData,
  type DisaggregationOption,
  type InstalledModuleSummary,
  type MetricWithStatus,
  type PresentationObjectConfig,
  type PresentationOption,
} from "lib";
import { unwrap } from "solid-js/store";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  timActionForm,
  getStepper,
  StepperChipsWithTitles,
} from "panther";
import { createSignal, createMemo, Match, Switch, Show } from "solid-js";
import { CUSTOM_OPTION } from "../preset_preview";
import { Step1Metric } from "./step_1_metric";
import { Step2Preset } from "./step_2_preset";
import { Step3Configure } from "./step_3_configure";

type AddVisualizationProps = {
  projectId: string;
  isGlobalAdmin: boolean;
  modules: InstalledModuleSummary[];
} & (
  | { preselectedMetric: MetricWithStatus }
  | { metrics: MetricWithStatus[] }
);

export function AddVisualization(
  p: AlertComponentProps<AddVisualizationProps, CreateModeVisualizationData>,
) {
  const preselectedMetric = "preselectedMetric" in p ? p.preselectedMetric : undefined;
  const metrics = () => "metrics" in p ? p.metrics : [];

  const [selectedMetricId, setSelectedMetricId] = createSignal(preselectedMetric?.id ?? "");
  const [selectedPresetId, setSelectedPresetId] = createSignal<string | undefined>(undefined);
  const [selectedType, setSelectedType] = createSignal<PresentationOption | undefined>(undefined);
  const [selectedDisaggregations, setSelectedDisaggregations] = createSignal<DisaggregationOption[]>([]);

  const selectedMetric = createMemo((): MetricWithStatus | undefined => {
    if (preselectedMetric) return preselectedMetric;
    return metrics().find((m) => m.id === selectedMetricId());
  });

  const isPresetSelected = () => {
    const id = selectedPresetId();
    return !!id && id !== CUSTOM_OPTION;
  };

  const stepperData = createMemo(() => ({
    hasMetric: !!selectedMetricId(),
    hasPreset: !!selectedPresetId(),
    hasType: !!selectedType(),
  }));

  const stepper = getStepper(stepperData, {
    initialStep: preselectedMetric ? 1 : 0,
    minStep: 0,
    maxStep: 2,
    getValidation: (step, data) => {
      if (step === 0) return { canGoPrev: false, canGoNext: data.hasMetric };
      if (step === 1) return { canGoPrev: true, canGoNext: data.hasPreset };
      if (step === 2) return { canGoPrev: true, canGoNext: data.hasType };
      return { canGoPrev: true, canGoNext: false };
    },
  });

  const stepLabels = [
    t3({ en: "Metric", fr: "Métrique" }),
    t3({ en: "Presets", fr: "Préréglages" }),
    t3({ en: "Configure", fr: "Configurer" }),
  ];

  const handleMetricSelect = (metricId: string) => {
    if (metricId !== selectedMetricId()) {
      setSelectedMetricId(metricId);
      setSelectedPresetId(undefined);
      setSelectedType(undefined);
      setSelectedDisaggregations([]);
    }
  };

  const handlePresetSelect = (presetId: string) => {
    setSelectedPresetId(presetId);
    setSelectedType(undefined);
    setSelectedDisaggregations([]);
  };

  const handleTypeSelect = (type: PresentationOption) => {
    setSelectedType(type);
    setSelectedDisaggregations([]);
  };

  const handleToggleDisaggregation = (disOpt: DisaggregationOption, checked: boolean) => {
    setSelectedDisaggregations((prev) =>
      checked ? [...prev, disOpt] : prev.filter((d) => d !== disOpt)
    );
  };

  const save = timActionForm(
    async () => {
      const metric = selectedMetric();
      if (!metric) {
        return { success: false, err: t3({ en: "You must select a metric", fr: "Vous devez sélectionner une métrique" }) };
      }

      const presetId = selectedPresetId();
      if (presetId && presetId !== CUSTOM_OPTION) {
        const preset = metric.vizPresets?.find((p) => p.id === presetId);
        if (!preset) {
          return { success: false, err: "Invalid preset" };
        }
        const presetConfig = structuredClone(unwrap(preset.config));
        const config: PresentationObjectConfig = {
          d: presetConfig.d,
          s: { ...DEFAULT_S_CONFIG, ...presetConfig.s },
          t: {
            ...DEFAULT_T_CONFIG,
            caption: presetConfig.t.caption ? t3(presetConfig.t.caption) : DEFAULT_T_CONFIG.caption,
            subCaption: presetConfig.t.subCaption ? t3(presetConfig.t.subCaption) : DEFAULT_T_CONFIG.subCaption,
            footnote: presetConfig.t.footnote ? t3(presetConfig.t.footnote) : DEFAULT_T_CONFIG.footnote,
            captionRelFontSize: presetConfig.t.captionRelFontSize ?? DEFAULT_T_CONFIG.captionRelFontSize,
            subCaptionRelFontSize: presetConfig.t.subCaptionRelFontSize ?? DEFAULT_T_CONFIG.subCaptionRelFontSize,
            footnoteRelFontSize: presetConfig.t.footnoteRelFontSize ?? DEFAULT_T_CONFIG.footnoteRelFontSize,
          },
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

      const type = selectedType();
      if (!type) {
        return { success: false, err: t3({ en: "You must select a visualization type", fr: "Vous devez sélectionner un type de visualisation" }) };
      }

      const disaggregations = metric.disaggregationOptions
        .filter(
          (disOpt) =>
            disOpt.isRequired || selectedDisaggregations().includes(disOpt.value)
        )
        .filter(
          (disOpt) =>
            !disOpt.allowedPresentationOptions ||
            disOpt.allowedPresentationOptions.includes(type)
        )
        .map((disOpt) => disOpt.value);

      const config = getStartingConfigForPresentationObject(metric, type, disaggregations);

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
    }
  );

  const isLastStep = () =>
    stepper.currentStep() === 2 ||
    (stepper.currentStep() === 1 && isPresetSelected());

  const handleNext = () => {
    stepper.goNext();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLastStep()) {
        save.click();
      } else {
        handleNext();
      }
    }
  };

  return (
    <ModalContainer
      width="xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({ en: "Create visualization", fr: "Créer une visualisation" })}
          </div>
          <StepperChipsWithTitles
            stepper={stepper}
            labels={stepLabels}
            visibleSteps={isPresetSelected() ? [0, 1] : [0, 1, 2]}
          />
        </div>
      }
      leftButtons={
        <Show when={stepper.currentStep() > 0}>
          <Button onClick={stepper.goPrev} outline>
            {t3({ en: "Back", fr: "Retour" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3({ en: "Cancel", fr: "Annuler" })}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={handleNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant" })}
              </Button>
            }
          >
            <Button
              onClick={save.click}
              disabled={!stepper.canGoNext()}
              loading={save.state().status === "loading"}
            >
              {t3({ en: "Create", fr: "Créer" })}
            </Button>
          </Show>
        </>
      }
    >
      <div class="h-[min(36rem,60vh)]" onKeyDown={handleKeyDown} tabIndex={0}>
        <Switch>
          <Match when={stepper.currentStep() === 0}>
            <Step1Metric
              metrics={metrics()}
              modules={p.modules}
              selectedMetricId={selectedMetricId()}
              onSelectMetric={handleMetricSelect}
            />
          </Match>
          <Match when={stepper.currentStep() === 1 && selectedMetric()}>
            <Step2Preset
              projectId={p.projectId}
              metric={selectedMetric()!}
              selectedPresetId={selectedPresetId()}
              onSelectPreset={handlePresetSelect}
            />
          </Match>
          <Match when={stepper.currentStep() === 2 && selectedMetric()}>
            <Step3Configure
              metric={selectedMetric()!}
              selectedType={selectedType()}
              selectedDisaggregations={selectedDisaggregations()}
              onSelectType={handleTypeSelect}
              onToggleDisaggregation={handleToggleDisaggregation}
            />
          </Match>
        </Switch>
      </div>
    </ModalContainer>
  );
}
