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
import { unwrap } from "solid-js/store";
import {
  AlertComponentProps,
  Button,
  ModalContainer,
  createFormAction,
  getStepper,
  StepperChipsWithTitles,
} from "panther";
import { createSignal, createMemo, Match, Switch, Show } from "solid-js";
import { CUSTOM_OPTION, type PresetOption } from "./preset_preview";
import { Step1Metric } from "./step_1_metric";
import { Step2Preset } from "./step_2_preset";
import { Step3Configure } from "./step_3_configure";

// What the wizard hands back. A figure IS `{ metricId, config }` (D3): the
// caller resolves the bundle under its own PackageScope, so nothing here is
// stored.
export type InsertFigureResult = {
  metric: MetricWithStatus;
  config: PresentationObjectConfig;
};

type Props = {
  // Only the preset previews need the pair; the metrics and modules come from
  // the package's authoring context, which carries no scope.
  scope: PackageScope;
  context: Pick<RunAuthoringContext, "metrics" | "modules">;
  // Skips straight to the preset step. null = start at metric selection.
  preselectedMetricId: string | null;
};

export function InsertFigureModal(
  p: AlertComponentProps<Props, InsertFigureResult>,
) {
  const [selectedMetricId, setSelectedMetricId] = createSignal(p.preselectedMetricId ?? "");
  const [selectedPresetId, setSelectedPresetId] = createSignal<string | undefined>(undefined);
  const [selectedType, setSelectedType] = createSignal<PresentationOption | undefined>(undefined);
  const [selectedDisaggregations, setSelectedDisaggregations] = createSignal<DisaggregationOption[]>([]);

  const selectedMetric = createMemo((): MetricWithStatus | undefined =>
    p.context.metrics.find((m) => m.id === selectedMetricId()),
  );

  // deriveConfigFromVizPreset is THE preset-to-config derivation; both the
  // previews and the inserted figure read from this one list. The metrics may
  // be a Solid store (the project pages pass projectState.metrics), and zod
  // chokes on the symbol keys a store leaves on its raw objects, so each preset
  // is cloned to plain data first.
  const presetOptions = createMemo((): PresetOption[] => {
    const metric = selectedMetric();
    if (!metric) return [];
    return (metric.vizPresets ?? []).map((preset) => {
      const plain = structuredClone(unwrap(preset));
      return {
        id: plain.id,
        label: t3(plain.label),
        description: t3(plain.description),
        config: deriveConfigFromVizPreset(plain, getLanguage()),
      };
    });
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
    initialStep: p.preselectedMetricId === null ? 0 : 1,
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

  const save = createFormAction(
    async () => {
      const metric = selectedMetric();
      if (!metric) {
        return { success: false, err: t3({ en: "You must select a metric", fr: "Vous devez sélectionner une métrique", pt: "Tem de selecionar uma métrica" }) };
      }

      const presetId = selectedPresetId();
      if (presetId && presetId !== CUSTOM_OPTION) {
        const preset = presetOptions().find((o) => o.id === presetId);
        if (!preset) {
          return { success: false, err: "Invalid preset" };
        }
        return {
          success: true,
          data: { metric, config: preset.config } satisfies InsertFigureResult,
        };
      }

      const type = selectedType();
      if (!type) {
        return { success: false, err: t3({ en: "You must select a visualization type", fr: "Vous devez sélectionner un type de visualisation", pt: "Tem de selecionar um tipo de visualização" }) };
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
        .filter((disOpt) => !FILTER_ONLY_DISAGGREGATION_OPTIONS.has(disOpt.value))
        .map((disOpt) => disOpt.value);

      return {
        success: true,
        data: {
          metric,
          config: getStartingConfigForPresentationObject(metric, type, disaggregations),
        } satisfies InsertFigureResult,
      };
    },
    (data) => {
      p.close(data);
    }
  );

  const isLastStep = () =>
    stepper.currentStep() === 2 ||
    (stepper.currentStep() === 1 && isPresetSelected());

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isLastStep()) {
        save.click();
      } else {
        stepper.goNext();
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
            {t3({ en: "Insert figure", fr: "Insérer une figure", pt: "Inserir figura" })}
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
                presets={presetOptions()}
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
