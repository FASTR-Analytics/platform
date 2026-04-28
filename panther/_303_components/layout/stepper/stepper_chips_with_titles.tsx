// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For } from "solid-js";
import type { Stepper } from "./get_stepper.ts";

interface StepperChipsWithTitlesProps {
  stepper: Stepper;
  /** Label per step, indexed by (step - minStep). If omitted, only the
   * number chip is shown. */
  labels?: string[];
  /** Override which steps to display. If omitted, shows all steps from
   * stepper.getAllSteps(). Useful for conditionally hiding steps. */
  visibleSteps?: number[];
  onStepClick?: (step: number) => void;
}

/**
 * Horizontal numbered-chip stepper with inline titles.
 *
 *   ① About     ② Prompts     ③ Student view
 *
 * Keeps the visual anchor of numbered chips from the classic stepper, but
 * pairs each with its title so users always know what each step is. No
 * heavy connector lines; steps are spaced with `gap-6`. The current step
 * uses primary fill; completed uses a neutral filled style (not success
 * green — completing a wizard step isn't a "success", just "done").
 *
 * Does not render Prev/Next.
 */
export function StepperChipsWithTitles(p: StepperChipsWithTitlesProps) {
  const handleClick = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    if (status !== "completed" && status !== "available") return;
    if (p.onStepClick) {
      p.onStepClick(step);
    } else {
      p.stepper.setCurrentStep(step);
    }
  };

  const labelFor = (step: number) => {
    const index = step - p.stepper.minStep;
    return p.labels?.[index];
  };

  const chipClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const base =
      "flex h-7 w-7 flex-none items-center justify-center rounded-full border text-xs font-700";
    switch (status) {
      case "current":
        return `${base} border-primary bg-primary text-primary-content`;
      case "completed":
        return `${base} border-base-300 bg-base-200 text-base-content`;
      case "available":
        return `${base} border-primary bg-base-100 text-primary`;
      case "locked":
        return `${base} border-base-300 bg-base-100 text-neutral/60`;
    }
  };

  const labelClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    switch (status) {
      case "current":
        return "text-base-content font-700 text-sm";
      case "completed":
      case "available":
        return "text-base-content text-sm";
      case "locked":
        return "text-neutral/60 text-sm";
    }
  };

  const rowClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const base = "flex items-center gap-2";
    if (status === "completed" || status === "available") {
      return `${base} cursor-pointer hover:opacity-80`;
    }
    if (status === "locked") return base;
    return base;
  };

  return (
    <nav class="flex flex-wrap items-center gap-x-6 gap-y-2">
      <For each={p.visibleSteps ?? p.stepper.getAllSteps()}>
        {(step) => {
          const label = labelFor(step);
          const stepIndex = step - p.stepper.minStep + 1;
          return (
            <button
              type="button"
              class={rowClasses(step)}
              disabled={p.stepper.getStepStatus(step) === "locked"}
              onClick={() => handleClick(step)}
              aria-current={
                p.stepper.currentStep() === step ? "step" : undefined
              }
            >
              <span class={chipClasses(step)}>{stepIndex}</span>
              {label ? <span class={labelClasses(step)}>{label}</span> : null}
            </button>
          );
        }}
      </For>
    </nav>
  );
}
