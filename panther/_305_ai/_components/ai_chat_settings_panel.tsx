// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlertComponentProps,
  type AnthropicModel,
  type AnthropicModelConfig,
  clampMaxOutputTokens,
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
  t3,
} from "../deps.ts";

export type AIChatSettingsValues = Pick<
  AnthropicModelConfig,
  "model" | "max_tokens" | "output_config"
>;

// UI field names — "effort" adjusts output_config.effort.
export type AIChatSettingsField = "model" | "max_tokens" | "effort";

export type AIChatSettingsPanelProps = {
  initialValues: AIChatSettingsValues;
  adjustable?: AIChatSettingsField[];
  allowedModels?: AnthropicModel[];
};

type Props = AlertComponentProps<
  AIChatSettingsPanelProps,
  AIChatSettingsValues
>;

type ModelOption = { value: AnthropicModel; label: string };

// The MODEL_OPTIONS entries allowedModels names, then the IDs it names that
// MODEL_OPTIONS lacks (a proxy's own model), labelled by ID.
export function settingsModelOptions(
  allowedModels: AnthropicModel[] | undefined,
): ModelOption[] {
  if (!allowedModels) {
    return MODEL_OPTIONS;
  }
  const known = new Set(MODEL_OPTIONS.map((o) => o.value));
  return [
    ...MODEL_OPTIONS.filter((o) => allowedModels.includes(o.value)),
    ...allowedModels
      .filter((id) => !known.has(id))
      .map((id) => ({ value: id, label: id })),
  ];
}

export function initialSettingsModel(
  options: ModelOption[],
  initial: AnthropicModel,
): AnthropicModel {
  if (options.some((o) => o.value === initial)) {
    return initial;
  }
  return options[0]?.value ?? initial;
}

// The max tokens and effort a model takes, from the ones picked so far: max
// tokens within its cap, and the effort Apply sends for it ("" for none).
export function settingsForModel(
  model: AnthropicModel,
  maxTokens: number,
  effort: EffortLevel | "",
): { maxTokens: number; effort: EffortLevel | "" } {
  return {
    maxTokens: clampMaxOutputTokens(maxTokens, model),
    effort: effort ? resolveOutputConfig(model, { effort })?.effort ?? "" : "",
  };
}

export function AIChatSettingsPanel(p: Props) {
  const fields = new Set(
    p.adjustable ?? ["model"] as AIChatSettingsField[],
  );

  const modelOptions = settingsModelOptions(p.allowedModels);
  const initialModel = initialSettingsModel(
    modelOptions,
    p.initialValues.model,
  );
  const initial = settingsForModel(
    initialModel,
    p.initialValues.max_tokens,
    p.initialValues.output_config?.effort ?? "",
  );

  const [model, setModel] = createSignal<AnthropicModel>(initialModel);
  const [maxTokens, setMaxTokens] = createSignal(initial.maxTokens);
  const [effort, setEffort] = createSignal<EffortLevel | "">(initial.effort);

  const changeModel = (next: AnthropicModel) => {
    const fitted = settingsForModel(next, maxTokens(), effort());
    setModel(next);
    setMaxTokens(fitted.maxTokens);
    setEffort(fitted.effort);
  };

  const EFFORT_LABELS: Record<EffortLevel, string> = {
    low: t3({ en: "Low", fr: "Faible", pt: "Baixo", th: "ต่ำ" }),
    medium: t3({ en: "Medium", fr: "Moyen", pt: "Médio", th: "ปานกลาง" }),
    high: t3({ en: "High", fr: "Élevé", pt: "Alto", th: "สูง" }),
    xhigh: t3({
      en: "Extra high",
      fr: "Très élevé",
      pt: "Muito alto",
      th: "สูงมาก",
    }),
    max: t3({ en: "Max", fr: "Max", pt: "Máx", th: "สูงสุด" }),
  };

  const effortOptions = () => [
    {
      value: "" as const,
      label: t3({
        en: "Default",
        fr: "Par défaut",
        pt: "Padrão",
        th: "ค่าเริ่มต้น",
      }),
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
        th: "การตั้งค่า AI",
      })}
      width="sm"
      onCancel={() => p.close(undefined)}
      actions={[{
        label: t3({
          en: "Apply",
          fr: "Appliquer",
          pt: "Aplicar",
          th: "นำไปใช้",
        }),
        onClick: () => {
          const chosen = effort();
          p.close({
            model: model(),
            max_tokens: maxTokens(),
            output_config: chosen ? { effort: chosen } : undefined,
          });
        },
      }]}
    >
      <Show when={fields.has("model")}>
        <Select
          label={t3({ en: "Model", fr: "Modèle", pt: "Modelo", th: "โมเดล" })}
          value={model()}
          options={modelOptions}
          onChange={changeModel}
          fullWidth
        />
      </Show>
      <Show
        when={fields.has("effort") &&
          getSupportedEffortLevels(model()).length > 0}
      >
        <Select
          label={t3({
            en: "Effort",
            fr: "Effort",
            pt: "Esforço",
            th: "ระดับความพยายาม",
          })}
          value={effort()}
          options={effortOptions()}
          onChange={setEffort}
          fullWidth
        />
      </Show>
      <Show when={fields.has("max_tokens")}>
        <Slider
          label={t3({
            en: "Max tokens",
            fr: "Tokens maximum",
            pt: "Tokens máximos",
            th: "โทเค็นสูงสุด",
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
