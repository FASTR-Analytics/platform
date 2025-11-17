// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, JSX, Show } from "solid-js";
import { toPct3 } from "../deps.ts";
import {
  generateEvenTicks,
  generateMinorsBetweenMajors,
  removeDuplicates,
  tickPosition,
} from "./_internal/tick_utils.ts";

type ComparisonSliderProps = {
  value: number;
  onChange: (value: number) => void;
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
  ticks?: {
    major?: number | number[];
    minor?: number | number[];
    showLabels?: boolean;
    labelFormatter?: (v: number) => string;
  };
};

export function ComparisonSlider(p: ComparisonSliderProps) {
  const min = () => p.min ?? 0;
  const max = () => p.max ?? 100;
  const step = () => p.step ?? 1;

  const fillStyle = createMemo(() => {
    const valuePct = (p.value - min()) / (max() - min());
    const comparisonPct = (p.comparisonValue - min()) / (max() - min());

    if (p.value > p.comparisonValue) {
      // Green fill from comparison to value
      return {
        left: toPct3(comparisonPct),
        right: toPct3(1 - valuePct),
      };
    } else if (p.value < p.comparisonValue) {
      // Red fill from value to comparison
      return {
        left: toPct3(valuePct),
        right: toPct3(1 - comparisonPct),
      };
    } else {
      // Equal - no fill
      return { display: "none" };
    }
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

  const majorTicks = createMemo(() => {
    if (!p.ticks?.major) return [];
    if (typeof p.ticks.major === "number") {
      return generateEvenTicks(p.ticks.major, min(), max());
    }
    return p.ticks.major.filter((v) => v >= min() && v <= max());
  });

  const minorTicks = createMemo(() => {
    if (!p.ticks?.minor) return [];

    if (typeof p.ticks.minor === "number") {
      const majors = majorTicks();
      if (majors.length < 2) return [];
      return generateMinorsBetweenMajors(majors, p.ticks.minor);
    }

    const minors = p.ticks.minor.filter((v) => v >= min() && v <= max());
    return removeDuplicates(minors.filter((v) => !majorTicks().includes(v)));
  });

  return (
    <div class="w-[200px] data-[width=true]:w-full" data-width={p.fullWidth}>
      <Show when={p.label}>
        <label class="ui-label !block">
          {p.label}
          <Show when={p.showValueInLabel}>
            {" "}
            ={" "}
            {p.valueInLabelFormatter
              ? p.valueInLabelFormatter(p.value)
              : p.value}
          </Show>
        </label>
      </Show>
      <div
        class="ui-doubleslider relative leading-none"
        classList={{
          "pb-0": !!p.ticks && !p.ticks.showLabels,
          "pb-4": !!p.ticks?.showLabels,
        }}
      >
        <Show when={p.ticks}>
          <div class="pointer-events-none absolute inset-x-2 top-3 select-none">
            <For each={majorTicks()}>
              {(value) => (
                <div
                  class="ui-slider-tick ui-slider-tick-major"
                  style={`left: ${tickPosition(value, min(), max())}%`}
                />
              )}
            </For>
            <For each={minorTicks()}>
              {(value) => (
                <div
                  class="ui-slider-tick ui-slider-tick-minor"
                  style={`left: ${tickPosition(value, min(), max())}%`}
                />
              )}
            </For>
          </div>
          <Show when={p.ticks?.showLabels}>
            <div class="pointer-events-none absolute inset-x-2 top-6 select-none">
              <For each={majorTicks()}>
                {(value) => (
                  <div
                    class="ui-slider-tick-label"
                    style={`left: ${tickPosition(value, min(), max())}%`}
                  >
                    {p.ticks?.labelFormatter
                      ? p.ticks.labelFormatter(value)
                      : value}
                  </div>
                )}
              </For>
            </div>
          </Show>
        </Show>
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
          onInput={(e) => p.onChange(Number(e.currentTarget.value))}
          disabled={p.disabled}
        />
      </div>
    </div>
  );
}
