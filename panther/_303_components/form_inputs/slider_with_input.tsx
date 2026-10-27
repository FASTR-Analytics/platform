// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { batch, createSignal, type JSX, Match, Switch } from "solid-js";
import { clamp } from "../deps.ts";
import { ComparisonSlider } from "./comparison_slider.tsx";
import { Field } from "./field.tsx";
import { Slider } from "./slider.tsx";
import type { SliderTicksConfig } from "./_internal/slider_ticks.tsx";

type SliderWithInputProps = {
  value: number;
  onChange: (value: number) => void;
  onRelease?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string | JSX.Element;
  disabled?: boolean;
  inputWidth?: string;
  inputMultiplier?: number;
  inputDisplayFormatter?: (v: number) => string;
  comparisonValue?: number;
  colorComparisonInput?: boolean;
  reverseColors?: boolean;
  ticks?: SliderTicksConfig;
};

function countDecimals(value: number): number {
  if (Math.floor(value) === value) return 0;
  // An exponential string carries places in both halves: 1.2e-7 is
  // 0.00000012, so the mantissa's own place adds to the exponent.
  const [mantissa, exponent] = value.toString().split("e-");
  const fraction = mantissa.split(".")[1]?.length ?? 0;
  return exponent ? fraction + parseInt(exponent, 10) : fraction;
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
  // Rounded to 12 significant digits: the raw product carries binary noise
  // (0.07 * 100 is 7.000000000000001), whose 15 decimal places would then be
  // the field's. Twelve keeps every step a person writes.
  const inputStep = () => Number((step() * multiplier()).toPrecision(12));
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
    batch(() => {
      setIsInvalid(outOfRange);
      p.onChange(actualValue);
    });
  };

  const sliderValue = () => (isFocused() ? frozenValue() : p.value);

  const handleFocus = () => {
    batch(() => {
      setFrozenValue(p.value);
      setIsFocused(true);
      setInputText(String(numericValue()));
    });
  };

  const handleBlur = () => {
    batch(() => {
      setIsFocused(false);

      if (inputText() === "" || isNaN(Number(inputText()))) {
        p.onChange(min());
      } else if (isInvalid()) {
        const clamped = clamp(p.value, min(), max());
        p.onChange(clamped);
      }

      setIsInvalid(false);
      setInputText("");
    });
  };

  const comparisonColorClass = () => {
    if (!p.colorComparisonInput || p.comparisonValue === undefined) {
      return "";
    }
    const isAbove = p.value > p.comparisonValue;
    const isBelow = p.value < p.comparisonValue;

    if (p.reverseColors) {
      if (isAbove) {
        return "text-danger-subtle-content border-danger bg-danger-subtle";
      }
      if (isBelow) {
        return "text-success-subtle-content border-success bg-success-subtle";
      }
    } else {
      if (isAbove) {
        return "text-success-subtle-content border-success bg-success-subtle";
      }
      if (isBelow) {
        return "text-danger-subtle-content border-danger bg-danger-subtle";
      }
    }
    return "";
  };

  return (
    <Field label={p.label}>
      <div class="ui-gap flex items-start">
        <div class="flex-grow">
          <Switch>
            <Match when={p.comparisonValue !== undefined}>
              <ComparisonSlider
                value={sliderValue()}
                onChange={p.onChange}
                onRelease={p.onRelease}
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
            <Match when={p.comparisonValue === undefined}>
              <Slider
                value={sliderValue()}
                onChange={p.onChange}
                onRelease={p.onRelease}
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
          class={`ui-focusable font-700 rounded border px-2 py-1 text-center text-lg ${comparisonColorClass()}`}
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
    </Field>
  );
}
