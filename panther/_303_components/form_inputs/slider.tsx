// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import type { JSX } from "solid-js";
import { type DataAttrs, splitDataAttrs } from "../data_attrs.ts";
import { Field } from "./field.tsx";
import {
  SliderTicks,
  type SliderTicksConfig,
} from "./_internal/slider_ticks.tsx";

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  onRelease?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string | JSX.Element;
  showValueInLabel?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  valueInLabelFormatter?: (v: number) => string;
  ticks?: SliderTicksConfig;
} & DataAttrs;

export function sliderLabel(p: {
  label?: string | JSX.Element;
  showValueInLabel?: boolean;
  valueInLabelFormatter?: (v: number) => string;
  value: number;
}): JSX.Element {
  if (!p.label) return undefined;
  if (!p.showValueInLabel) return p.label;
  return (
    <>
      {p.label} ={" "}
      {p.valueInLabelFormatter ? p.valueInLabelFormatter(p.value) : p.value}
    </>
  );
}

export function Slider(p: SliderProps) {
  const [dataAttrs] = splitDataAttrs(p);
  const min = () => p.min ?? 0;
  const max = () => p.max ?? 100;

  return (
    <Field
      {...dataAttrs}
      label={sliderLabel(p)}
      width="w-[200px]"
      fullWidth={p.fullWidth}
    >
      <div
        class="relative leading-none"
        classList={{
          "pb-0": !!p.ticks && !p.ticks.showLabels,
          "pb-4": !!p.ticks?.showLabels,
        }}
      >
        <SliderTicks ticks={p.ticks} min={min()} max={max()} />
        <input
          type="range"
          value={p.value}
          onInput={(e) => p.onChange(Number(e.currentTarget.value))}
          onChange={(e) => p.onRelease?.(Number(e.currentTarget.value))}
          min={min()}
          max={max()}
          step={p.step ?? 1}
          disabled={p.disabled}
          class="ui-slider relative z-10 w-full"
        />
      </div>
    </Field>
  );
}
