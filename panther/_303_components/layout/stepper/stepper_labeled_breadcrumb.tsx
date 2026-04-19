// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For } from "solid-js";
import type { Stepper } from "./get_stepper.ts";

interface StepperLabeledBreadcrumbProps {
  stepper: Stepper;
  /** Label per step, indexed by (step - minStep). If omitted, falls back
   * to "Step N". */
  labels?: string[];
  onStepClick?: (step: number) => void;
}

/**
 * Horizontal breadcrumb-style step indicator using the continuous-rail
 * pattern: one base-300 underline runs across the whole strip; the
 * current step overlays it with the primary color.
 *
 *   About    Prompts    Student view
 *   ─────    ═══════    ────────────
 *
 * Same idiom as the horizontal Tabs component, so it sits visually
 * consistent with tab bars in the same app.
 *
 * Does not render Prev/Next — the caller owns navigation chrome.
 */
export function StepperLabeledBreadcrumb(p: StepperLabeledBreadcrumbProps) {
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

  // Each item carries its own border-b-2 so the active item's primary line
  // sits over the container's border-b (via -mb-px below). Inactive items
  // use border-transparent so the container line shows through, producing
  // a single clean rail across the whole strip.
  const classesFor = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const base =
      "px-3 py-2 text-sm border-b-2 transition-colors whitespace-nowrap";
    switch (status) {
      case "current":
        return `${base} text-primary font-700 border-primary`;
      case "completed":
      case "available":
        return `${base} text-base-content hover:text-primary border-transparent hover:border-primary/40 cursor-pointer`;
      case "locked":
        return `${base} text-neutral/60 border-transparent`;
    }
  };

  return (
    <nav
      class="w-full border-b border-base-300"
      aria-label="Progress"
    >
      <div class="-mb-px flex flex-wrap">
        <For each={p.stepper.getAllSteps()}>
          {(step) => (
            <button
              type="button"
              class={classesFor(step)}
              disabled={p.stepper.getStepStatus(step) === "locked"}
              onClick={() => handleClick(step)}
              aria-current={
                p.stepper.currentStep() === step ? "step" : undefined
              }
            >
              {labelFor(step)}
            </button>
          )}
        </For>
      </div>
    </nav>
  );
}
