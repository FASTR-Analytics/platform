import {
  FILTER_ONLY_DISAGGREGATION_OPTIONS,
  deriveConfigFromVizPreset,
  getLanguage,
  getStartingConfigForPresentationObject,
  t3,
  type DisaggregationOption,
  type MetricWithStatus,
  type PackageScope,
  type PresentationObjectConfig,
  type PresentationOption,
  type RunAuthoringContext,
} from "lib";
import {
  Button,
  ModalContainer,
  StepperChipsWithTitles,
  createFormAction,
  getStepper,
  type AlertComponentProps,
} from "panther";
import { Match, Show, Switch, createMemo, createSignal } from "solid-js";
import { CUSTOM_OPTION } from "./preset_preview";
import { Step1Metric } from "./step_1_metric";
import { Step2Preset } from "./step_2_preset";
import { Step3Configure } from "./step_3_configure";

// The feature's public surface: the wizard itself, the preset gallery pieces
// the Explore page renders as a page, and the metric browser both share.
export { CUSTOM_OPTION, PresetPreview, PresetSelector } from "./preset_preview";
export { MetricCard } from "./metric_card";
export { ModuleSidebar } from "./module_sidebar";

// What the wizard hands back: the metric and the config to resolve it under.
// A figure IS `{ metricId, config }` (D3) — the caller resolves the bundle
// under its own product's PackageScope, which is why nothing here is stored.
export type InsertFigureResult = {
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

type Props = {
  // Only the preview fetches need the pair; the metrics, modules and presets
  // all come from the run's authoring context, which carries no scope.
  scope: PackageScope;
  context: RunAuthoringContext;
  // Skips straight to the preset step. null = start at metric selection.
  preselectedMetricId: string | null;
};

export function InsertFigureModal(
  p: AlertComponentProps<Props, InsertFigureResult>,
) {
  const preselectedMetric = () =>
    p.preselectedMetricId === null
      ? undefined
      : p.context.metrics.find((m) => m.id === p.preselectedMetricId);

  const [selectedMetricId, setSelectedMetricId] = createSignal(
    p.preselectedMetricId ?? "",
  );
  const [selectedPresetId, setSelectedPresetId] = createSignal<
    string | undefined
  >(undefined);
  const [selectedType, setSelectedType] = createSignal<
    PresentationOption | undefined
  >(undefined);
  const [selectedDisaggregations, setSelectedDisaggregations] = createSignal<
    DisaggregationOption[]
  >([]);

  const selectedMetric = createMemo((): MetricWithStatus | undefined =>
    p.context.metrics.find((m) => m.id === selectedMetricId()),
  );

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
    initialStep: preselectedMetric() ? 1 : 0,
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
    t3({ en: "Metric", fr: "Métrique", pt: "Métrica" }),
    t3({ en: "Presets", fr: "Préréglages", pt: "Predefinições" }),
    t3({ en: "Configure", fr: "Configurer", pt: "Configurar" }),
  ];

  function handleMetricSelect(metricId: string) {
    if (metricId === selectedMetricId()) return;
    setSelectedMetricId(metricId);
    setSelectedPresetId(undefined);
    setSelectedType(undefined);
    setSelectedDisaggregations([]);
  }

  function handlePresetSelect(presetId: string) {
    setSelectedPresetId(presetId);
    setSelectedType(undefined);
    setSelectedDisaggregations([]);
  }

  function handleTypeSelect(type: PresentationOption) {
    setSelectedType(type);
    setSelectedDisaggregations([]);
  }

  function handleToggleDisaggregation(
    disOpt: DisaggregationOption,
    checked: boolean,
  ) {
    setSelectedDisaggregations((prev) =>
      checked ? [...prev, disOpt] : prev.filter((d) => d !== disOpt),
    );
  }

  const save = createFormAction(
    async () => {
      const metric = selectedMetric();
      if (!metric) {
        return {
          success: false,
          err: t3({
            en: "You must select a metric",
            fr: "Vous devez sélectionner une métrique",
            pt: "Tem de selecionar uma métrica",
          }),
        };
      }

      const presetId = selectedPresetId();
      if (presetId && presetId !== CUSTOM_OPTION) {
        const preset = metric.vizPresets?.find((v) => v.id === presetId);
        if (!preset) {
          return { success: false, err: "Invalid preset" };
        }
        return {
          success: true,
          data: {
            metric,
            config: deriveConfigFromVizPreset(preset, getLanguage()),
          } satisfies InsertFigureResult,
        };
      }

      const type = selectedType();
      if (!type) {
        return {
          success: false,
          err: t3({
            en: "You must select a visualization type",
            fr: "Vous devez sélectionner un type de visualisation",
            pt: "Tem de selecionar um tipo de visualização",
          }),
        };
      }

      const disaggregations = metric.disaggregationOptions
        .filter(
          (disOpt) =>
            disOpt.isRequired ||
            selectedDisaggregations().includes(disOpt.value),
        )
        .filter(
          (disOpt) =>
            !disOpt.allowedPresentationOptions ||
            disOpt.allowedPresentationOptions.includes(type),
        )
        .filter(
          (disOpt) => !FILTER_ONLY_DISAGGREGATION_OPTIONS.has(disOpt.value),
        )
        .map((disOpt) => disOpt.value);

      return {
        success: true,
        data: {
          metric,
          config: getStartingConfigForPresentationObject(
            metric,
            type,
            disaggregations,
          ),
        } satisfies InsertFigureResult,
      };
    },
    (data) => {
      p.close(data);
    },
  );

  const isLastStep = () =>
    stepper.currentStep() === 2 ||
    (stepper.currentStep() === 1 && isPresetSelected());

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key !== "Enter" || e.shiftKey) return;
    e.preventDefault();
    if (isLastStep()) {
      save.click();
    } else {
      stepper.goNext();
    }
  }

  return (
    <ModalContainer
      width="xl"
      noContentPadding
      topPanel={
        <div class="flex items-center justify-between">
          <div class="font-700 text-lg">
            {t3({
              en: "Insert figure",
              fr: "Insérer une figure",
              pt: "Inserir figura",
            })}
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
            {t3({ en: "Back", fr: "Retour", pt: "Voltar" })}
          </Button>
        </Show>
      }
      rightButtons={
        <>
          <Button onClick={() => p.close(undefined)} outline>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
          </Button>
          <Show
            when={isLastStep()}
            fallback={
              <Button onClick={stepper.goNext} disabled={!stepper.canGoNext()}>
                {t3({ en: "Next", fr: "Suivant", pt: "Seguinte" })}
              </Button>
            }
          >
            <Button
              onClick={save.click}
              disabled={!stepper.canGoNext()}
              loading={save.state().status === "loading"}
            >
              {t3({ en: "Insert", fr: "Insérer", pt: "Inserir" })}
            </Button>
          </Show>
        </>
      }
    >
      <div class="h-[min(36rem,60vh)]" onKeyDown={handleKeyDown} tabIndex={0}>
        <Switch>
          <Match when={stepper.currentStep() === 0}>
            <Step1Metric
              metrics={p.context.metrics}
              modules={p.context.modules}
              selectedMetricId={selectedMetricId()}
              onSelectMetric={handleMetricSelect}
            />
          </Match>
          <Match when={stepper.currentStep() === 1 && selectedMetric()} keyed>
            {(metric) => (
              <Step2Preset
                scope={p.scope}
                metric={metric}
                selectedPresetId={selectedPresetId()}
                onSelectPreset={handlePresetSelect}
              />
            )}
          </Match>
          <Match when={stepper.currentStep() === 2 && selectedMetric()} keyed>
            {(metric) => (
              <Step3Configure
                metric={metric}
                selectedType={selectedType()}
                selectedDisaggregations={selectedDisaggregations()}
                onSelectType={handleTypeSelect}
                onToggleDisaggregation={handleToggleDisaggregation}
              />
            )}
          </Match>
        </Switch>
      </div>
    </ModalContainer>
  );
}
