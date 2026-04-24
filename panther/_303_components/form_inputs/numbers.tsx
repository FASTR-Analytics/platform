// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";
import type { Intent } from "../types.ts";
import { Input } from "./input.tsx";
import { Select } from "./select.tsx";
import type { SelectOption } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// NumberInput
////////////////////////////////////////////////////////////////////////////////

type NumberInputProps = {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  min?: number;
  max?: number;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  size?: "sm";
};

export function NumberInput(p: NumberInputProps) {
  const [isFocused, setIsFocused] = createSignal(false);
  const [text, setText] = createSignal("");
  const [invalid, setInvalid] = createSignal(false);

  const displayValue = () => (isFocused() ? text() : String(p.value));

  const handleFocus = () => {
    setIsFocused(true);
    setText(String(p.value));
    setInvalid(false);
  };

  const handleBlur = () => {
    setIsFocused(false);

    const trimmed = text().trim();
    if (trimmed === "") return;

    const parsed = Number(trimmed);
    if (isNaN(parsed)) {
      setInvalid(true);
      return;
    }

    let clamped = parsed;
    if (p.min !== undefined && clamped < p.min) clamped = p.min;
    if (p.max !== undefined && clamped > p.max) clamped = p.max;

    setInvalid(false);
    p.onChange(clamped);
  };

  return (
    <div
      class="w-24 data-[width=true]:w-full"
      data-width={p.fullWidth}
      onFocusIn={handleFocus}
      onFocusOut={handleBlur}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    >
      <Input
        value={displayValue()}
        onChange={setText}
        label={p.label}
        intent={invalid() ? "danger" : p.intent}
        fullWidth
        invalidMsg={invalid() ? (p.invalidMsg ?? "Invalid number") : undefined}
        size={p.size}
      />
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// PercentSelect
////////////////////////////////////////////////////////////////////////////////

const PERCENT_VALUES = [
  0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45,
  0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 0.96, 0.97, 0.98, 0.99,
  1,
];

const NEGATIVE_PERCENT_VALUES = [
  -1, -0.99, -0.98, -0.97, -0.96, -0.95, -0.9, -0.85, -0.8, -0.75, -0.7, -0.65,
  -0.6, -0.55, -0.5, -0.45, -0.4, -0.35, -0.3, -0.25, -0.2, -0.15, -0.1, -0.05,
  -0.04, -0.03, -0.02, -0.01,
];

function toPct0(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function makePercentOption(
  v: number,
  showPlusPrefix: boolean,
): SelectOption<string> {
  const label = showPlusPrefix && v > 0 ? `+${toPct0(v)}` : toPct0(v);
  return { value: String(v), label };
}

type PercentSelectProps = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  allowNegative?: boolean;
  showPlusPrefix?: boolean;
  intent?: Intent;
  label?: string;
  fullWidth?: boolean;
  invalidMsg?: string;
  size?: "sm";
};

export function PercentSelect(p: PercentSelectProps) {
  const filteredOptions = () => {
    const baseValues = p.allowNegative
      ? [...PERCENT_VALUES.slice().reverse(), ...NEGATIVE_PERCENT_VALUES.slice().reverse()]
      : PERCENT_VALUES.slice().reverse();
    const min = p.min ?? (p.allowNegative ? -1 : 0);
    const max = p.max ?? 1;
    return baseValues
      .filter((v) => v >= min && v <= max)
      .map((v) => makePercentOption(v, p.showPlusPrefix ?? false));
  };

  return (
    <div class="w-24 data-[width=true]:w-full" data-width={p.fullWidth}>
      <Select
        value={String(p.value)}
        options={filteredOptions()}
        onChange={(v) => p.onChange(Number(v))}
        label={p.label}
        intent={p.intent}
        fullWidth
        invalidMsg={p.invalidMsg}
        size={p.size}
      />
    </div>
  );
}
