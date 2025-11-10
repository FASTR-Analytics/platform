// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { batch, createMemo } from "solid-js";
import { toPct3 } from "../deps.ts";

type DoubleSliderProps = {
  min: number;
  max: number;
  increment: number;
  valueLow: number;
  valueHigh: number;
  onChangeLow: (v: number) => void;
  onChangeHigh: (v: number) => void;
  minDifference?: number;
};

export function DoubleSlider(p: DoubleSliderProps) {
  const minDiff = p.minDifference ?? 0;

  // Calculate the fill bar position and width
  const fillStyle = createMemo(() => {
    if (p.valueLow >= p.valueHigh) {
      return { display: "none" };
    }

    const lowPercent = (p.valueLow - p.min) / (p.max - p.min);
    const highPercent = (p.valueHigh - p.min) / (p.max - p.min);

    return {
      left: toPct3(lowPercent),
      right: toPct3(1 - highPercent),
    };
  });

  function handleLowChange(newValue: number) {
    // Ensure low value doesn't exceed (max - minDifference)
    const maxAllowedLow = p.max - minDiff;
    const constrainedValue = Math.min(newValue, maxAllowedLow);

    batch(() => {
      p.onChangeLow(constrainedValue);
      // Push high value up if needed to maintain minimum difference
      if (constrainedValue + minDiff > p.valueHigh) {
        p.onChangeHigh(constrainedValue + minDiff);
      }
    });

    return constrainedValue;
  }

  function handleHighChange(newValue: number) {
    // Ensure high value doesn't go below (min + minDifference)
    const minAllowedHigh = p.min + minDiff;
    const constrainedValue = Math.max(newValue, minAllowedHigh);

    batch(() => {
      p.onChangeHigh(constrainedValue);
      // Push low value down if needed to maintain minimum difference
      if (constrainedValue - minDiff < p.valueLow) {
        p.onChangeLow(constrainedValue - minDiff);
      }
    });

    return constrainedValue;
  }

  return (
    <div class="ui-doubleslider">
      <div
        class="ui-doubleslider-fill"
        style={fillStyle()}
      />
      <input
        type="range"
        class="ui-doubleslider-low"
        min={p.min}
        max={p.max}
        step={p.increment}
        value={p.valueLow}
        onInput={(e) => {
          const newValue = Number(e.target.value);
          const constrainedValue = handleLowChange(newValue);
          // Force the input to display the constrained value
          e.target.value = String(constrainedValue);
        }}
      />
      <input
        type="range"
        class="ui-doubleslider-high"
        min={p.min}
        max={p.max}
        step={p.increment}
        value={p.valueHigh}
        onInput={(e) => {
          const newValue = Number(e.target.value);
          const constrainedValue = handleHighChange(newValue);
          // Force the input to display the constrained value
          e.target.value = String(constrainedValue);
        }}
      />
    </div>
  );
}
