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
  0, 1, 2, 3, 4, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80,
  85, 90, 95, 96, 97, 98, 99, 100,
];

const PERCENT_OPTIONS: SelectOption<string>[] = PERCENT_VALUES.map((v) => ({
  value: String(v),
  label: `${v}%`,
}));

type PercentSelectProps = {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  intent?: Intent;
  label?: string;
  fullWidth?: boolean;
  invalidMsg?: string;
  size?: "sm";
};

export function PercentSelect(p: PercentSelectProps) {
  const toPercent = (v: number) => String(Math.round(v * 100));
  const toDecimal = (v: string) => Number(v) / 100;

  const filteredOptions = () => {
    const minPct = p.min !== undefined ? Math.round(p.min * 100) : 0;
    const maxPct = p.max !== undefined ? Math.round(p.max * 100) : 100;
    return PERCENT_OPTIONS.filter((opt) => {
      const v = Number(opt.value);
      return v >= minPct && v <= maxPct;
    });
  };

  return (
    <div class="w-24 data-[width=true]:w-full" data-width={p.fullWidth}>
      <Select
        value={toPercent(p.value)}
        options={filteredOptions()}
        onChange={(v) => p.onChange(toDecimal(v))}
        label={p.label}
        intent={p.intent}
        fullWidth
        invalidMsg={p.invalidMsg}
        size={p.size}
      />
    </div>
  );
}
