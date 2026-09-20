// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createMemo, For, Show } from "solid-js";
import {
  generateEvenTicks,
  generateMinorsBetweenMajors,
  removeDuplicates,
  tickPosition,
} from "./tick_utils.ts";

export type SliderTicksConfig = {
  major?: number | number[];
  minor?: number | number[];
  showLabels?: boolean;
  labelFormatter?: (v: number) => string;
};

type SliderTicksProps = {
  ticks: SliderTicksConfig | undefined;
  min: number;
  max: number;
};

// The tick marks and labels painted under a range input, shared by every
// slider. The caller adds bottom padding when labels are shown.
export function SliderTicks(p: SliderTicksProps) {
  const majorTicks = createMemo(() => {
    if (!p.ticks?.major) return [];
    if (typeof p.ticks.major === "number") {
      return generateEvenTicks(p.ticks.major, p.min, p.max);
    }
    return p.ticks.major.filter((v) => v >= p.min && v <= p.max);
  });

  const minorTicks = createMemo(() => {
    if (!p.ticks?.minor) return [];
    if (typeof p.ticks.minor === "number") {
      const majors = majorTicks();
      if (majors.length < 2) return [];
      return generateMinorsBetweenMajors(majors, p.ticks.minor);
    }
    const minors = p.ticks.minor.filter((v) => v >= p.min && v <= p.max);
    return removeDuplicates(minors.filter((v) => !majorTicks().includes(v)));
  });

  return (
    <Show when={p.ticks}>
      <div class="pointer-events-none absolute inset-x-2 top-3 select-none">
        <For each={majorTicks()}>
          {(value) => (
            <div
              class="ui-slider-tick ui-slider-tick-major"
              style={`left: ${tickPosition(value, p.min, p.max)}%`}
            />
          )}
        </For>
        <For each={minorTicks()}>
          {(value) => (
            <div
              class="ui-slider-tick ui-slider-tick-minor"
              style={`left: ${tickPosition(value, p.min, p.max)}%`}
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
                style={`left: ${tickPosition(value, p.min, p.max)}%`}
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
  );
}
