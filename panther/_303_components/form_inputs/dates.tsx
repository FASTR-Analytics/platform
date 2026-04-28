// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal } from "solid-js";
import { isFrench } from "../deps.ts";
import type { Intent } from "../types.ts";
import { Select } from "./select.tsx";
import type { SelectOption } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// MonthSelect
////////////////////////////////////////////////////////////////////////////////

const MONTHS_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function getMonthOptions(): SelectOption<string>[] {
  const months = isFrench() ? MONTHS_FR : MONTHS_EN;
  return months.map((label, i) => ({
    value: String(i + 1).padStart(2, "0"),
    label,
  }));
}

type MonthSelectProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  size?: "sm";
};

export function MonthSelect(p: MonthSelectProps) {
  return (
    <div class="w-40 data-[width=true]:w-full" data-width={p.fullWidth}>
      <Select
        value={p.value}
        options={getMonthOptions()}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        fullWidth
        invalidMsg={p.invalidMsg}
        size={p.size}
      />
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// YearSelect
////////////////////////////////////////////////////////////////////////////////

type YearSelectProps = {
  value: string;
  onChange: (v: string) => void;
  minYear?: number;
  maxYear?: number;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  size?: "sm";
};

export function YearSelect(p: YearSelectProps) {
  const options = () => {
    const min = p.minYear ?? 2020;
    const max = p.maxYear ?? 2035;
    const years: SelectOption<string>[] = [];
    for (let y = min; y <= max; y++) {
      years.push({ value: String(y), label: String(y) });
    }
    return years;
  };

  return (
    <div class="w-28 data-[width=true]:w-full" data-width={p.fullWidth}>
      <Select
        value={p.value}
        options={options()}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        fullWidth
        invalidMsg={p.invalidMsg}
        size={p.size}
      />
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// PeriodSelect
////////////////////////////////////////////////////////////////////////////////

type PeriodSelectProps = {
  value: string;
  onChange: (periodId: string) => void;
  minYear?: number;
  maxYear?: number;
  yearLabel?: string;
  monthLabel?: string;
  intent?: Intent;
  size?: "sm";
};

export function PeriodSelect(p: PeriodSelectProps) {
  const [year, setYear] = createSignal(p.value.slice(0, 4));
  const [month, setMonth] = createSignal(p.value.slice(4, 6));

  const handleYearChange = (newYear: string) => {
    setYear(newYear);
    const m = month();
    if (newYear && m) {
      p.onChange(`${newYear}${m}`);
    }
  };

  const handleMonthChange = (newMonth: string) => {
    setMonth(newMonth);
    const y = year();
    if (y && newMonth) {
      p.onChange(`${y}${newMonth}`);
    }
  };

  return (
    <div class="flex gap-4">
      <YearSelect
        value={year()}
        onChange={handleYearChange}
        minYear={p.minYear}
        maxYear={p.maxYear}
        label={p.yearLabel}
        intent={p.intent}
        size={p.size}
      />
      <MonthSelect
        value={month()}
        onChange={handleMonthChange}
        label={p.monthLabel}
        intent={p.intent}
        size={p.size}
      />
    </div>
  );
}
