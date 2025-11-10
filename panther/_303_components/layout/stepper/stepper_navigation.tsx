// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Button } from "../../form_inputs/mod.ts";
import type { Stepper } from "./get_stepper.ts";

interface StepperNavigationProps {
  stepper: Stepper;
  stepLabelFormatter?: (step: number) => string;
}

export function StepperNavigation(p: StepperNavigationProps) {
  const formatter = p.stepLabelFormatter ?? String;

  return (
    <div class="ui-gap-sm flex items-center">
      <div class="">{formatter(p.stepper.currentStep())}</div>
      <Button
        onClick={p.stepper.goPrev}
        disabled={!p.stepper.canGoPrev()}
        iconName="chevronLeft"
      />
      <Button
        onClick={p.stepper.goNext}
        disabled={!p.stepper.canGoNext()}
        iconName="chevronRight"
      />
    </div>
  );
}
