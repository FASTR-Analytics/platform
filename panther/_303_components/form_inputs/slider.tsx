// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, type JSX, Show } from "solid-js";
import {
  generateEvenTicks,
  generateMinorsBetweenMajors,
  removeDuplicates,
  tickPosition,
} from "./_internal/tick_utils.ts";

type SliderProps = {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string | JSX.Element;
  showValueInLabel?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
  valueInLabelFormatter?: (v: number) => string;
  ticks?: {
    major?: number | number[];
    minor?: number | number[];
    showLabels?: boolean;
    labelFormatter?: (v: number) => string;
  };
};

export function Slider(p: SliderProps) {
  const min = () => p.min ?? 0;
  const max = () => p.max ?? 100;

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
        class="relative leading-none"
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
        <input
          type="range"
          value={p.value}
          onInput={(e) => p.onChange(Number(e.currentTarget.value))}
          min={min()}
          max={max()}
          step={p.step ?? 1}
          disabled={p.disabled}
          class="ui-slider relative z-10 w-full"
        />
      </div>
    </div>
  );
}
