// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, type JSX } from "solid-js";
import { toPct3 } from "../deps.ts";
import { Field } from "./field.tsx";
import { sliderLabel } from "./slider.tsx";
import {
  SliderTicks,
  type SliderTicksConfig,
} from "./_internal/slider_ticks.tsx";

type ComparisonSliderProps = {
  value: number;
  onChange: (value: number) => void;
  onRelease?: (value: number) => void;
  comparisonValue: number;
  min?: number;
  max?: number;
  step?: number;
  label?: string | JSX.Element;
  showValueInLabel?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  reverseColors?: boolean;
  valueInLabelFormatter?: (v: number) => string;
  ticks?: SliderTicksConfig;
};

export function ComparisonSlider(p: ComparisonSliderProps) {
  const min = () => p.min ?? 0;
  const max = () => p.max ?? 100;
  const step = () => p.step ?? 1;

  const fillStyle = createMemo(() => {
    const valuePct = (p.value - min()) / (max() - min());
    const comparisonPct = (p.comparisonValue - min()) / (max() - min());
    if (p.value > p.comparisonValue) {
      return { left: toPct3(comparisonPct), right: toPct3(1 - valuePct) };
    }
    if (p.value < p.comparisonValue) {
      return { left: toPct3(valuePct), right: toPct3(1 - comparisonPct) };
    }
    return { display: "none" };
  });

  const fillColorClass = createMemo(() => {
    const isAbove = p.value > p.comparisonValue;
    const isBelow = p.value < p.comparisonValue;
    if (p.reverseColors) {
      if (isAbove) return "ui-comparisonslider-fill-below";
      if (isBelow) return "ui-comparisonslider-fill-above";
    } else {
      if (isAbove) return "ui-comparisonslider-fill-above";
      if (isBelow) return "ui-comparisonslider-fill-below";
    }
    return "";
  });

  return (
    <Field label={sliderLabel(p)} width="w-[200px]" fullWidth={p.fullWidth}>
      <div
        class="ui-doubleslider relative leading-none"
        classList={{
          "pb-0": !!p.ticks && !p.ticks.showLabels,
          "pb-4": !!p.ticks?.showLabels,
        }}
      >
        <SliderTicks ticks={p.ticks} min={min()} max={max()} />
        <div
          class={`ui-doubleslider-fill ${fillColorClass()}`}
          style={fillStyle()}
        />
        <input
          type="range"
          class="ui-doubleslider-low ui-comparisonslider-comparison"
          min={min()}
          max={max()}
          step={step()}
          value={p.comparisonValue}
          disabled
          style={{ "pointer-events": "none" }}
        />
        <input
          type="range"
          class="ui-doubleslider-high"
          min={min()}
          max={max()}
          step={step()}
          value={p.value}
          onInput={(e) =>
            p.onChange(Number(e.currentTarget.value))}
          onChange={(e) =>
            p.onRelease?.(Number(e.currentTarget.value))}
          disabled={p.disabled}
        />
      </div>
    </Field>
  );
}
