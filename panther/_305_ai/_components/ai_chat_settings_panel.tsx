// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import {
  type AlertComponentProps,
  type AnthropicModel,
  type AnthropicModelConfig,
  Button,
  createSignal,
  MAX_OUTPUT_TOKENS,
  ModalContainer,
  MODEL_OPTIONS,
  Select,
  Show,
  Slider,
} from "../deps.ts";

export type AIChatSettingsValues = Pick<
  AnthropicModelConfig,
  "model" | "max_tokens" | "temperature"
>;

export type AIChatSettingsField = keyof AIChatSettingsValues;

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

  return (
    <ModalContainer
      title="AI settings"
      width="sm"
      leftButtons={
        // eslint-disable-next-line jsx-key
        [
          <Button
            intent="primary"
            onClick={() =>
              p.close({
                model: model(),
                temperature: temperature(),
                max_tokens: maxTokens(),
              })}
          >
            Apply
          </Button>,
          <Button intent="neutral" onClick={() => p.close(undefined)}>
            Cancel
          </Button>,
        ]
      }
    >
      <Show when={fields.has("model")}>
        <Select
          label="Model"
          value={model()}
          options={modelOptions}
          onChange={setModel}
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
          min={MAX_OUTPUT_TOKENS.MIN}
          max={MAX_OUTPUT_TOKENS.MAX}
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
