// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { Accessor, createSignal, Setter } from "solid-js";

export interface StepValidation {
  canGoPrev: boolean;
  canGoNext: boolean;
}

export interface GetStepperOptions<T> {
  initialStep?: number;
  minStep?: number;
  maxStep?: number;
  getValidation: (step: number, data: T) => StepValidation;
}

export type StepStatus = "completed" | "current" | "available" | "locked";

export interface Stepper {
  currentStep: Accessor<number>;
  setCurrentStep: Setter<number>;
  goNext: () => void;
  goPrev: () => void;
  canGoNext: () => boolean;
  canGoPrev: () => boolean;
  getStepStatus: (step: number) => StepStatus;
  getAllSteps: () => number[];
  minStep: number;
  maxStep: number;
}

export function getStepper<T>(
  data: Accessor<T>,
  options: GetStepperOptions<T>,
): Stepper {
  const minStep = options.minStep ?? 0;
  const maxStep = options.maxStep ?? 4; // Default to 5 steps (0-4)
  const [currentStep, setCurrentStep] = createSignal(
    options.initialStep ?? minStep,
  );

  const validation = () => {
    const step = currentStep();
    const result = options.getValidation(step, data());
    return { ...result, currentStep: step };
  };

  const goNext = () => {
    const v = validation();
    if (v.canGoNext && v.currentStep < maxStep) {
      setCurrentStep(v.currentStep + 1);
    }
  };

  const goPrev = () => {
    const v = validation();
    if (v.canGoPrev && v.currentStep > minStep) {
      setCurrentStep(v.currentStep - 1);
    }
  };

  const getStepStatus = (step: number): StepStatus => {
    const current = currentStep();
    if (step === current) return "current";
    if (step < current) return "completed";
    if (step === current + 1 && validation().canGoNext) return "available";
    return "locked";
  };

  const getAllSteps = (): number[] => {
    const steps: number[] = [];
    for (let i = minStep; i <= maxStep; i++) {
      steps.push(i);
    }
    return steps;
  };

  return {
    currentStep,
    setCurrentStep,
    goNext,
    goPrev,
    canGoNext: () => validation().canGoNext,
    canGoPrev: () => validation().canGoPrev,
    getStepStatus,
    getAllSteps,
    minStep,
    maxStep,
  };
}
