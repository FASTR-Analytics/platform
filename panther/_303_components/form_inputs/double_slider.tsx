// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { batch, createMemo, type JSX } from "solid-js";
import { toPct3 } from "../deps.ts";
import { Field } from "./field.tsx";

type DoubleSliderProps = {
  min: number;
  max: number;
  increment: number;
  valueLow: number;
  valueHigh: number;
  onChangeLow: (v: number) => void;
  onChangeHigh: (v: number) => void;
  onReleaseLow?: (v: number) => void;
  onReleaseHigh?: (v: number) => void;
  minDifference?: number;
  label?: string | JSX.Element;
  fullWidth?: boolean;
};

export function DoubleSlider(p: DoubleSliderProps) {
  const minDiff = () => p.minDifference ?? 0;

  const fillStyle = createMemo(() => {
    if (p.valueLow >= p.valueHigh) {
      return { display: "none" };
    }
    const lowPercent = (p.valueLow - p.min) / (p.max - p.min);
    const highPercent = (p.valueHigh - p.min) / (p.max - p.min);
    return { left: toPct3(lowPercent), right: toPct3(1 - highPercent) };
  });

  // Each thumb is clamped so the pair keeps minDifference, pushing the other
  // thumb when needed.
  function handleLowChange(newValue: number) {
    const constrainedValue = Math.min(newValue, p.max - minDiff());
    batch(() => {
      p.onChangeLow(constrainedValue);
      if (constrainedValue + minDiff() > p.valueHigh) {
        p.onChangeHigh(constrainedValue + minDiff());
      }
    });
    return constrainedValue;
  }

  function handleHighChange(newValue: number) {
    const constrainedValue = Math.max(newValue, p.min + minDiff());
    batch(() => {
      p.onChangeHigh(constrainedValue);
      if (constrainedValue - minDiff() < p.valueLow) {
        p.onChangeLow(constrainedValue - minDiff());
      }
    });
    return constrainedValue;
  }

  return (
    <Field label={p.label} fullWidth={p.fullWidth}>
      <div class="ui-doubleslider">
        <div class="ui-doubleslider-fill" style={fillStyle()} />
        <input
          type="range"
          class="ui-doubleslider-low"
          min={p.min}
          max={p.max}
          step={p.increment}
          value={p.valueLow}
          onInput={(e) => {
            const constrainedValue = handleLowChange(Number(e.target.value));
            e.target.value = String(constrainedValue);
          }}
          onChange={(e) => p.onReleaseLow?.(Number(e.target.value))}
        />
        <input
          type="range"
          class="ui-doubleslider-high"
          min={p.min}
          max={p.max}
          step={p.increment}
          value={p.valueHigh}
          onInput={(e) => {
            const constrainedValue = handleHighChange(Number(e.target.value));
            e.target.value = String(constrainedValue);
          }}
          onChange={(e) => p.onReleaseHigh?.(Number(e.target.value))}
        />
      </div>
    </Field>
  );
}
