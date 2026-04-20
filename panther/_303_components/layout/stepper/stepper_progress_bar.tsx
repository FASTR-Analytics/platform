// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Show } from "solid-js";
import type { Stepper } from "./get_stepper.ts";

interface StepperProgressBarProps {
  stepper: Stepper;
  /** Label per step, indexed by (step - minStep). Used to show the
   * current step's title. Optional — omit for a bar-only indicator. */
  labels?: string[];
  /** Single-line layout: bar on the right of the label instead of below
   * it. Good for very tight headers (modals, compact toolbars). */
  inline?: boolean;
}

/**
 * Minimal progress-bar stepper.
 *
 *   Step 2 of 3 · Prompts
 *   ▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░░
 *
 * No circles, no clickable steps, no navigation buttons. Just a quiet
 * progress readout that says "where you are" and gets out of the way. Best
 * when the wizard content itself should be the focus of the page.
 */
export function StepperProgressBar(p: StepperProgressBarProps) {
  const total = () =>
    p.stepper.maxStep - p.stepper.minStep + 1;

  const currentIndex = () =>
    p.stepper.currentStep() - p.stepper.minStep;

  /** 0..1 fraction filled. Current step counts as "in-progress" — we fill
   * up to the end of the current step's slot so the bar visibly advances
   * on each Next click. */
  const fraction = () => (currentIndex() + 1) / total();

  const currentLabel = () => p.labels?.[currentIndex()];

  const label = (
    <div class="text-sm whitespace-nowrap">
      <span class="text-neutral">
        Step {currentIndex() + 1} of {total()}
      </span>
      <Show when={currentLabel()}>
        <span class="text-base-content font-700">
          {" "}
          · {currentLabel()}
        </span>
      </Show>
    </div>
  );

  const bar = (
    <div class="bg-base-300 relative h-1.5 flex-1 overflow-hidden rounded-full">
      <div
        class="bg-primary h-full transition-[width] duration-200"
        style={{ width: `${fraction() * 100}%` }}
      />
    </div>
  );

  return (
    <div
      class={p.inline ? "flex items-center gap-3" : "ui-spy-sm"}
      role="progressbar"
      aria-valuenow={currentIndex() + 1}
      aria-valuemin={1}
      aria-valuemax={total()}
    >
      {label}
      {bar}
    </div>
  );
}
