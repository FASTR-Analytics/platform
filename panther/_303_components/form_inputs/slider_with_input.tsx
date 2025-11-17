// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, type JSX, Match, Show, Switch } from "solid-js";
import { ComparisonSlider } from "./comparison_slider.tsx";
import { Slider } from "./slider.tsx";

type SliderWithInputProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string | JSX.Element;
  labelSize?: "sm" | "base" | "lg" | "xl";
  disabled?: boolean;
  inputWidth?: string;
  inputMultiplier?: number;
  inputDisplayFormatter?: (v: number) => string;
  comparisonValue?: number;
  colorComparisonInput?: boolean;
  reverseColors?: boolean;
  ticks?: {
    major?: number | number[];
    minor?: number | number[];
    showLabels?: boolean;
    labelFormatter?: (v: number) => string;
  };
};

function countDecimals(value: number): number {
  if (Math.floor(value) === value) return 0;
  const str = value.toString();
  if (str.includes("e-")) {
    return parseInt(str.split("e-")[1], 10);
  }
  return str.split(".")[1]?.length || 0;
}

export function SliderWithInput(p: SliderWithInputProps) {
  const min = () => p.min ?? 0;
  const max = () => p.max ?? 100;
  const [isInvalid, setIsInvalid] = createSignal(false);
  const [isFocused, setIsFocused] = createSignal(false);
  const [inputText, setInputText] = createSignal("");
  const [frozenValue, setFrozenValue] = createSignal(0);

  const multiplier = () => p.inputMultiplier ?? 1;
  const step = () => p.step ?? 1;
  const inputStep = () => step() * multiplier();
  const decimalPlaces = () => countDecimals(inputStep());

  const numericValue = () => {
    const rawValue = p.value * multiplier();
    return Number(rawValue.toFixed(decimalPlaces()));
  };

  const displayValue = () => {
    if (isFocused()) {
      return inputText();
    }
    if (p.inputDisplayFormatter) {
      return p.inputDisplayFormatter(p.value);
    }
    return String(numericValue());
  };

  const handleInputChange = (text: string) => {
    setInputText(text);

    if (text === "") {
      return;
    }

    const parsed = Number(text);
    if (isNaN(parsed)) {
      return;
    }

    const actualValue = parsed / multiplier();
    const outOfRange = actualValue < min() || actualValue > max();
    setIsInvalid(outOfRange);
    p.onChange(actualValue);
  };

  const sliderValue = () => (isFocused() ? frozenValue() : p.value);

  const handleFocus = () => {
    setFrozenValue(p.value);
    setIsFocused(true);
    setInputText(String(numericValue()));
  };

  const handleBlur = () => {
    setIsFocused(false);

    if (inputText() === "" || isNaN(Number(inputText()))) {
      p.onChange(min());
    } else if (isInvalid()) {
      const clamped = Math.max(min(), Math.min(max(), p.value));
      p.onChange(clamped);
    }

    setIsInvalid(false);
    setInputText("");
  };

  const labelSizeClass = () => {
    switch (p.labelSize) {
      case "sm":
        return "text-sm";
      case "lg":
        return "text-lg";
      case "xl":
        return "text-xl";
      default:
        return "text-base";
    }
  };

  const comparisonColorClass = () => {
    if (!p.colorComparisonInput || p.comparisonValue === undefined) {
      return "";
    }
    const isAbove = p.value > p.comparisonValue;
    const isBelow = p.value < p.comparisonValue;

    if (p.reverseColors) {
      if (isAbove) {
        return "text-danger border-danger bg-danger/20";
      }
      if (isBelow) {
        return "text-success border-success bg-success/20";
      }
    } else {
      if (isAbove) {
        return "text-success border-success bg-success/20";
      }
      if (isBelow) {
        return "text-danger border-danger bg-danger/20";
      }
    }
    return "";
  };

  return (
    <div>
      <Show when={p.label}>
        <label class={`ui-label !block pb-2 ${labelSizeClass()}`}>
          {p.label}
        </label>
      </Show>
      <div class="ui-gap flex items-start">
        <div class="flex-grow">
          <Switch>
            <Match when={p.comparisonValue !== undefined}>
              <ComparisonSlider
                value={sliderValue()}
                onChange={p.onChange}
                comparisonValue={p.comparisonValue!}
                min={p.min}
                max={p.max}
                step={p.step}
                fullWidth
                disabled={p.disabled}
                reverseColors={p.reverseColors}
                ticks={p.ticks}
              />
            </Match>
            <Match when>
              <Slider
                value={sliderValue()}
                onChange={p.onChange}
                min={p.min}
                max={p.max}
                step={p.step}
                fullWidth
                disabled={p.disabled}
                ticks={p.ticks}
              />
            </Match>
          </Switch>
        </div>
        <input
          type="text"
          inputmode="numeric"
          class={`ui-focusable font-700 border-base-300 rounded border px-2 py-1 text-center text-lg ${comparisonColorClass()}`}
          classList={{
            "!border-danger !text-base-content focus:!border-danger focus:!ring-danger":
              isInvalid(),
          }}
          style={{ width: p.inputWidth ?? "96px" }}
          value={displayValue()}
          onInput={(e) => {
            handleInputChange(e.currentTarget.value);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={p.disabled}
        />
      </div>
    </div>
  );
}
