// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For, Show } from "solid-js";
import type { Stepper } from "./get_stepper.ts";

interface StepperVerticalSidebarProps {
  stepper: Stepper;
  /** Label per step, indexed by (step - minStep). If omitted, shows
   * "Step N". */
  labels?: string[];
  /** Optional sub-description per step (one-line). Good for "What this
   * step covers" hints. */
  descriptions?: string[];
  /** Narrow-rail mode: chip only, no labels/descriptions. Use when the
   * sidebar container is too narrow for labels (e.g. ≤ 60px rail). */
  collapsed?: boolean;
  onStepClick?: (step: number) => void;
}

/**
 * Vertical step indicator for a left-pane sidebar.
 *
 *   ╔════════════════════╗
 *   ║ ✓ 1  About         ║   completed
 *   ║ ● 2  Prompts       ║   current (left bar + bg)
 *   ║   3  Student view  ║   locked
 *   ║   4  Criteria      ║
 *   ║   5  Scoring       ║
 *   ╚════════════════════╝
 *
 * Suited for wizards with many steps, where horizontal indicators get
 * cramped. Caller wraps this in a sidebar container of their own width
 * choice and renders the current step's content next to it.
 *
 * Does not render Prev/Next.
 */
export function StepperVerticalSidebar(p: StepperVerticalSidebarProps) {
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
    return p.labels?.[index] ?? `Step ${step + 1}`;
  };

  const descriptionFor = (step: number) => {
    const index = step - p.stepper.minStep;
    return p.descriptions?.[index];
  };

  const rowClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const paddingX = p.collapsed ? "px-2" : "px-4";
    const justify = p.collapsed ? "justify-center" : "items-start";
    const base =
      `relative flex w-full ${justify} gap-3 ${paddingX} py-3 text-left text-sm transition-colors`;
    switch (status) {
      case "current":
        return `${base} bg-primary/5 shadow-[inset_3px_0_0_0_var(--color-primary)] cursor-default`;
      case "completed":
        return `${base} hover:bg-base-200 cursor-pointer`;
      case "available":
        return `${base} hover:bg-base-200 cursor-pointer`;
      case "locked":
        return `${base} cursor-not-allowed`;
    }
  };

  const chipClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const base =
      "flex h-6 w-6 flex-none items-center justify-center rounded-full border text-xs font-700 mt-0.5";
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

  const titleClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    switch (status) {
      case "current":
        return "text-base-content font-700";
      case "completed":
      case "available":
        return "text-base-content";
      case "locked":
        return "text-neutral/60";
    }
  };

  const descriptionClasses = "text-neutral text-xs mt-0.5";

  return (
    <nav class="w-full" aria-label="Progress">
      <ul class="flex flex-col">
        <For each={p.stepper.getAllSteps()}>
          {(step) => {
            const stepIndex = step - p.stepper.minStep + 1;
            return (
              <li>
                <button
                  type="button"
                  class={rowClasses(step)}
                  disabled={p.stepper.getStepStatus(step) === "locked"}
                  onClick={() => handleClick(step)}
                  aria-current={
                    p.stepper.currentStep() === step ? "step" : undefined
                  }
                >
                  <span class={chipClasses(step)}>
                    {p.stepper.getStepStatus(step) === "completed"
                      ? "✓"
                      : stepIndex}
                  </span>
                  <Show when={!p.collapsed}>
                    <span class="flex-1">
                      <span class={titleClasses(step)}>
                        {labelFor(step)}
                      </span>
                      <Show when={descriptionFor(step)}>
                        <span class={`block ${descriptionClasses}`}>
                          {descriptionFor(step)}
                        </span>
                      </Show>
                    </span>
                  </Show>
                </button>
              </li>
            );
          }}
        </For>
      </ul>
    </nav>
  );
}
