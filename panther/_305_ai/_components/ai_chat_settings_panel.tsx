// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlertComponentProps,
  type AnthropicModel,
  type AnthropicModelConfig,
  Button,
  Checkbox,
  createSignal,
  Select,
  type SelectOption,
  Show,
  Slider,
} from "../deps.ts";

export type AIChatSettingsValues = Pick<
  AnthropicModelConfig,
  "model" | "max_tokens" | "temperature" | "context1M"
>;

export type AIChatSettingsField = keyof AIChatSettingsValues;

const MODEL_OPTIONS: SelectOption<AnthropicModel>[] = [
  { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
  { value: "claude-opus-4-5-20251101", label: "Claude Opus 4.5" },
  { value: "claude-sonnet-4-5-20250929", label: "Claude Sonnet 4.5" },
  { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "claude-opus-4-1-20250805", label: "Claude Opus 4.1" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4" },
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
  { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet" },
];

const CONTEXT_1M_SUPPORTED_MODELS = new Set([
  "claude-opus-4-6",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-20250514",
]);

export type AIChatSettingsPanelProps = {
  initialValues: AIChatSettingsValues;
  adjustable?: AIChatSettingsField[];
  allowedModels?: AnthropicModel[];
};

type Props = AlertComponentProps<AIChatSettingsPanelProps, AIChatSettingsValues>;

export function AIChatSettingsPanel(p: Props) {
  const fields = new Set(
    p.adjustable ?? ["model", "context1M"] as AIChatSettingsField[],
  );

  const modelOptions = p.allowedModels
    ? MODEL_OPTIONS.filter((o) => p.allowedModels!.includes(o.value))
    : MODEL_OPTIONS;

  const initialModel = p.allowedModels && !p.allowedModels.includes(p.initialValues.model)
    ? modelOptions[0].value
    : p.initialValues.model;

  const [model, setModel] = createSignal<AnthropicModel>(initialModel);
  const [temperature, setTemperature] = createSignal(
    p.initialValues.temperature ?? 1,
  );
  const [maxTokens, setMaxTokens] = createSignal(p.initialValues.max_tokens);
  const [context1M, setContext1M] = createSignal(
    p.initialValues.context1M ?? false,
  );

  const supportsContext1M = () => CONTEXT_1M_SUPPORTED_MODELS.has(model());

  return (
    <div class="w-96">
      <div class="ui-pad border-base-300 border-b">
        <h2 class="text-base font-semibold">AI settings</h2>
      </div>
      <div class="ui-pad ui-spy">
        <Show when={fields.has("model")}>
          <Select
            label="Model"
            value={model()}
            options={modelOptions}
            onChange={(v) => {
              setModel(v);
              if (!CONTEXT_1M_SUPPORTED_MODELS.has(v)) {
                setContext1M(false);
              }
            }}
            fullWidth
          />
        </Show>
        <Show when={fields.has("temperature")}>
          <Slider
            label="Temperature"
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
            label="Max tokens"
            value={maxTokens()}
            onChange={(v) => setMaxTokens(Math.round(v))}
            min={256}
            max={128000}
            step={256}
            showValueInLabel
            valueInLabelFormatter={(v) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}K` : String(v)}
            fullWidth
          />
        </Show>
        <Show when={fields.has("context1M") && supportsContext1M()}>
          <Checkbox
            label="Enable 1M context window (beta)"
            checked={context1M()}
            onChange={setContext1M}
          />
        </Show>
      </div>
      <div class="ui-pad border-base-300 flex gap-2 border-t">
        <Button
          intent="primary"
          onClick={() =>
            p.close({
              model: model(),
              temperature: temperature(),
              max_tokens: maxTokens(),
              context1M: context1M(),
            })}
        >
          Apply
        </Button>
        <Button intent="neutral" onClick={() => p.close(undefined)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
