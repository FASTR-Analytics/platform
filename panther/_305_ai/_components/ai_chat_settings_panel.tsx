// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlertComponentProps,
  type AnthropicModel,
  type AnthropicModelConfig,
  Button,
  createSignal,
  type EffortLevel,
  getMaxOutputTokens,
  getSupportedEffortLevels,
  MAX_OUTPUT_TOKENS,
  ModalContainer,
  MODEL_OPTIONS,
  resolveOutputConfig,
  Select,
  Show,
  Slider,
  supportsSamplingParams,
  t3,
} from "../deps.ts";

export type AIChatSettingsValues = Pick<
  AnthropicModelConfig,
  "model" | "max_tokens" | "temperature" | "output_config"
>;

// UI field names — "effort" adjusts output_config.effort.
export type AIChatSettingsField =
  | "model"
  | "max_tokens"
  | "temperature"
  | "effort";

export type AIChatSettingsPanelProps = {
  initialValues: AIChatSettingsValues;
  adjustable?: AIChatSettingsField[];
  allowedModels?: AnthropicModel[];
};

type Props = AlertComponentProps<
  AIChatSettingsPanelProps,
  AIChatSettingsValues
>;

export function AIChatSettingsPanel(p: Props) {
  const fields = new Set(
    p.adjustable ?? ["model"] as AIChatSettingsField[],
  );

  const modelOptions = p.allowedModels
    ? MODEL_OPTIONS.filter((o) => p.allowedModels!.includes(o.value))
    : MODEL_OPTIONS;

  const initialModel =
    p.allowedModels && !p.allowedModels.includes(p.initialValues.model)
      ? modelOptions[0].value
      : p.initialValues.model;

  const [model, setModel] = createSignal<AnthropicModel>(initialModel);
  const [temperature, setTemperature] = createSignal(
    p.initialValues.temperature ?? 1,
  );
  const [maxTokens, setMaxTokens] = createSignal(p.initialValues.max_tokens);
  const [effort, setEffort] = createSignal<EffortLevel | "">(
    p.initialValues.output_config?.effort ?? "",
  );

  const EFFORT_LABELS: Record<EffortLevel, string> = {
    low: t3({ en: "Low", fr: "Faible", pt: "Baixo" }),
    medium: t3({ en: "Medium", fr: "Moyen", pt: "Médio" }),
    high: t3({ en: "High", fr: "Élevé", pt: "Alto" }),
    xhigh: t3({ en: "Extra high", fr: "Très élevé", pt: "Muito alto" }),
    max: t3({ en: "Max", fr: "Max", pt: "Máx" }),
  };

  const effortOptions = () => [
    {
      value: "" as const,
      label: t3({ en: "Default", fr: "Par défaut", pt: "Padrão" }),
    },
    ...getSupportedEffortLevels(model()).map((level) => ({
      value: level,
      label: EFFORT_LABELS[level],
    })),
  ];

  return (
    <ModalContainer
      title={t3({
        en: "AI settings",
        fr: "Paramètres IA",
        pt: "Definições de IA",
      })}
      width="sm"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            intent="primary"
            onClick={() =>
              p.close({
                model: model(),
                // Models from Opus 4.7 onward reject non-default sampling
                // params — don't carry a temperature setting onto them.
                temperature: supportsSamplingParams(model())
                  ? temperature()
                  : undefined,
                max_tokens: Math.min(maxTokens(), getMaxOutputTokens(model())),
                // Re-resolve in case the model changed after the effort was
                // picked (unsupported levels are clamped/dropped per model).
                output_config: effort()
                  ? resolveOutputConfig(model(), {
                    effort: effort() as EffortLevel,
                  })
                  : undefined,
              })}
          >
            {t3({ en: "Apply", fr: "Appliquer", pt: "Aplicar" })}
          </Button>,
          <Button intent="neutral" onClick={() => p.close(undefined)}>
            {t3({ en: "Cancel", fr: "Annuler", pt: "Cancelar" })}
          </Button>,
        ]
      }
    >
      <Show when={fields.has("model")}>
        <Select
          label={t3({ en: "Model", fr: "Modèle", pt: "Modelo" })}
          value={model()}
          options={modelOptions}
          onChange={setModel}
          fullWidth
        />
      </Show>
      <Show
        when={fields.has("effort") &&
          getSupportedEffortLevels(model()).length > 0}
      >
        <Select
          label={t3({ en: "Effort", fr: "Effort", pt: "Esforço" })}
          value={effort()}
          options={effortOptions()}
          onChange={setEffort}
          fullWidth
        />
      </Show>
      <Show when={fields.has("temperature") && supportsSamplingParams(model())}>
        <Slider
          label={t3({
            en: "Temperature",
            fr: "Température",
            pt: "Temperatura",
          })}
          value={temperature()}
          onChange={setTemperature}
          min={0}
          max={1}
          step={0.05}
          showValueInLabel
          fullWidth
        />
      </Show>
      <Show when={fields.has("max_tokens")}>
        <Slider
          label={t3({
            en: "Max tokens",
            fr: "Tokens maximum",
            pt: "Tokens máximos",
          })}
          value={maxTokens()}
          onChange={(v) => setMaxTokens(Math.round(v))}
          min={MAX_OUTPUT_TOKENS.MIN}
          max={getMaxOutputTokens(model())}
          step={MAX_OUTPUT_TOKENS.STEP}
          showValueInLabel
          valueInLabelFormatter={(v) =>
            v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}
          fullWidth
        />
      </Show>
    </ModalContainer>
  );
}
