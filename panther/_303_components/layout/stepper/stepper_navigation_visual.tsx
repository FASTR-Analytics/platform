// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { For } from "solid-js";
import type { Stepper } from "./get_stepper.ts";
import { Button } from "../../form_inputs/mod.ts";

interface StepperNavigationVisualProps {
  stepper: Stepper;
  onStepClick?: (step: number) => void;
  stepLabelFormatter?: (step: number) => string;
}

export function StepperNavigationVisual(p: StepperNavigationVisualProps) {
  const handleStepClick = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    // Only allow clicking on completed or available steps
    if (status === "completed" || status === "available") {
      if (p.onStepClick) {
        p.onStepClick(step);
      } else {
        p.stepper.setCurrentStep(step);
      }
    }
  };

  const getStepClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const baseClasses =
      "relative flex h-8 w-8 items-center justify-center rounded-full border-2 font-semibold";

    switch (status) {
      case "current":
        return `${baseClasses} border-primary bg-primary text-primary-content`;
      case "completed":
        return `${baseClasses} border-success bg-success text-success-content cursor-pointer hover:opacity-80`;
      case "available":
        return `${baseClasses} border-primary bg-base-100 text-primary cursor-pointer hover:bg-primary hover:text-primary-content`;
      case "locked":
        return `${baseClasses} border-base-300 bg-base-100 text-base-300`;
      default:
        return baseClasses;
    }
  };

  const getConnectorClasses = (step: number) => {
    const status = p.stepper.getStepStatus(step);
    const nextStatus = step < p.stepper.maxStep
      ? p.stepper.getStepStatus(step + 1)
      : null;

    const baseClasses = "h-0.5 flex-1";

    if (
      status === "completed" &&
      (nextStatus === "completed" ||
        nextStatus === "current" ||
        nextStatus === "available")
    ) {
      return `${baseClasses} bg-success`;
    }
    return `${baseClasses} bg-base-300`;
  };

  const formatter = p.stepLabelFormatter ?? String;

  return (
    <div class="ui-gap flex items-center">
      <div class="flex items-center gap-x-1">
        <For each={p.stepper.getAllSteps()}>
          {(step, index) => (
            <>
              <button
                class={getStepClasses(step)}
                onClick={() => handleStepClick(step)}
                disabled={p.stepper.getStepStatus(step) === "locked"}
                aria-label={`Step ${formatter(step)}`}
                aria-current={p.stepper.currentStep() === step
                  ? "step"
                  : undefined}
              >
                {formatter(step)}
              </button>
              {index() < p.stepper.getAllSteps().length - 1 && (
                <div class={getConnectorClasses(step)} />
              )}
            </>
          )}
        </For>
      </div>
      <div class="ui-gap-sm flex items-center">
        <Button
          onClick={p.stepper.goPrev}
          disabled={!p.stepper.canGoPrev()}
          iconName="chevronLeft"
        >
          Prev
        </Button>
        <Button
          onClick={p.stepper.goNext}
          disabled={!p.stepper.canGoNext()}
          iconName="chevronRight"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
