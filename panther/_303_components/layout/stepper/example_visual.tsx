// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";
import {
  getStepper,
  StepperNavigation,
  StepperNavigationVisual,
} from "./mod.ts";

// Example showing visual stepper with steps 1-5 (internally 0-4)
export function ExampleVisualStepper() {
  const [data, setData] = createSignal({
    step1Complete: false,
    step2Complete: false,
    step3Complete: false,
    step4Complete: false,
  });

  // Option 1: Using 0-4 internally, display as 1-5
  const stepper0Based = getStepper(() => data(), {
    initialStep: 0,
    minStep: 0,
    maxStep: 4,
    getValidation: (step, currentData) => {
      switch (step) {
        case 0:
          return { canGoPrev: false, canGoNext: true };
        case 1:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete,
          };
        case 2:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete && currentData.step2Complete,
          };
        case 3:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete &&
              currentData.step2Complete &&
              currentData.step3Complete,
          };
        case 4:
          return { canGoPrev: true, canGoNext: false };
        default:
          return { canGoPrev: false, canGoNext: false };
      }
    },
  });

  // Option 2: Using 1-5 for both internal and display
  const stepper1Based = getStepper(() => data(), {
    initialStep: 1,
    minStep: 1,
    maxStep: 5,
    getValidation: (step, currentData) => {
      switch (step) {
        case 1:
          return { canGoPrev: false, canGoNext: true };
        case 2:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete,
          };
        case 3:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete && currentData.step2Complete,
          };
        case 4:
          return {
            canGoPrev: true,
            canGoNext: currentData.step1Complete &&
              currentData.step2Complete &&
              currentData.step3Complete,
          };
        case 5:
          return { canGoPrev: true, canGoNext: false };
        default:
          return { canGoPrev: false, canGoNext: false };
      }
    },
  });

  return (
    <div class="space-y-8">
      <div>
        <h3>Visual Stepper (0-based, displayed as 1-5)</h3>
        <StepperNavigationVisual
          stepper={stepper0Based}
          stepLabelFormatter={(step) => String(step + 1)}
        />
        <p>Current step (internal): {stepper0Based.currentStep()}</p>
        <p>Current step (display): {stepper0Based.currentStep() + 1}</p>
      </div>

      <div>
        <h3>Visual Stepper (1-based)</h3>
        <StepperNavigationVisual
          stepper={stepper1Based}
          // No formatter needed - steps are already 1-5
        />
        <p>Current step: {stepper1Based.currentStep()}</p>
      </div>

      <div>
        <h3>Button Navigation (still works)</h3>
        <StepperNavigation
          stepper={stepper0Based}
          stepLabelFormatter={(step) => `Step ${step + 1}`}
        />
      </div>

      <div>
        <h3>Custom click handler</h3>
        <StepperNavigationVisual
          stepper={stepper0Based}
          stepLabelFormatter={(step) => String(step + 1)}
          onStepClick={(step) => {
            console.log(`Clicked step ${step}`);
            // Custom logic before setting step
            stepper0Based.setCurrentStep(step);
          }}
        />
      </div>
    </div>
  );
}
