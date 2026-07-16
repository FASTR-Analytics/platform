// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { createSignal, Show } from "solid-js";
import { getLanguage } from "../deps.ts";
import type { Language, ZonedDateTime } from "../deps.ts";
import type { Intent } from "../types.ts";
import { Icon } from "../icons/mod.ts";
import type { IconName } from "../icons/mod.ts";
import { getInputClasses } from "./_internal/input_classes.ts";
import { Select } from "./select.tsx";
import type { SelectOption } from "./types.ts";

////////////////////////////////////////////////////////////////////////////////
// MonthSelect
////////////////////////////////////////////////////////////////////////////////

const MONTHS_BY_LANG: Record<Language, string[]> = {
  en: [
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
  ],
  fr: [
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
  ],
  pt: [
    "Janeiro",
    "Fevereiro",
    "Março",
    "Abril",
    "Maio",
    "Junho",
    "Julho",
    "Agosto",
    "Setembro",
    "Outubro",
    "Novembro",
    "Dezembro",
  ],
};

function getMonthOptions(): SelectOption<string>[] {
  const months = MONTHS_BY_LANG[getLanguage()];
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

////////////////////////////////////////////////////////////////////////////////
// Native picker inputs (browser owns the popup, panther owns the box)
////////////////////////////////////////////////////////////////////////////////

type NativePickerInputProps = {
  type: "date" | "time" | "datetime-local";
  iconName: IconName;
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

function NativePickerInput(p: NativePickerInputProps) {
  let inputEl: HTMLInputElement | undefined;

  const openPicker = () => {
    if (!inputEl || p.disabled) {
      return;
    }
    try {
      inputEl.showPicker();
    } catch {
      inputEl.focus();
    }
  };

  return (
    <div>
      {
        /* [contain:inline-size] keeps label/message out of the w-fit intrinsic
          width — they wrap at the input's width instead of widening it */
      }
      <Show when={p.label}>
        <div class="[contain:inline-size]">
          <label class="ui-label" data-intent={p.intent}>
            {p.label}
          </label>
        </div>
      </Show>
      <div class="ui-form-text relative w-full">
        <input
          ref={(el) => (inputEl = el)}
          class={`ui-native-picker !pr-[2.5em] ${
            getInputClasses(p.size, false)
          }`}
          data-intent={p.intent}
          type={p.type}
          value={p.value}
          onInput={(e) => p.onChange(e.currentTarget.value)}
          disabled={p.disabled}
        />
        <div
          class="text-base-content absolute bottom-0 right-[0.5em] top-0 my-auto flex h-[1.5em] w-[1.5em] cursor-pointer items-center justify-center"
          onClick={openPicker}
        >
          <Icon iconName={p.iconName} />
        </div>
      </div>
      <Show when={p.invalidMsg}>
        <div class="[contain:inline-size]">
          <div class="ui-text-small text-danger inline-block pt-1">
            {p.invalidMsg}
          </div>
        </div>
      </Show>
    </div>
  );
}

// Native pickers have locale-dependent intrinsic widths (12-hour locales
// append " AM"/" PM"), so the default width is w-fit: the input's own
// pr-[2.5em] makes the intrinsic width include the icon allowance exactly.
type DateInputProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

export function DateInput(p: DateInputProps) {
  return (
    <div class="w-fit data-[width=true]:w-full" data-width={p.fullWidth}>
      <NativePickerInput
        type="date"
        iconName="calendar"
        value={p.value}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        invalidMsg={p.invalidMsg}
        disabled={p.disabled}
        size={p.size}
      />
    </div>
  );
}

type TimeInputProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

export function TimeInput(p: TimeInputProps) {
  return (
    <div class="w-fit data-[width=true]:w-full" data-width={p.fullWidth}>
      <NativePickerInput
        type="time"
        iconName="clock"
        value={p.value}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        invalidMsg={p.invalidMsg}
        disabled={p.disabled}
        size={p.size}
      />
    </div>
  );
}

type DateTimeInputProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

export function DateTimeInput(p: DateTimeInputProps) {
  return (
    <div class="w-fit data-[width=true]:w-full" data-width={p.fullWidth}>
      <NativePickerInput
        type="datetime-local"
        iconName="calendar"
        value={p.value}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        invalidMsg={p.invalidMsg}
        disabled={p.disabled}
        size={p.size}
      />
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// TimezoneSelect
////////////////////////////////////////////////////////////////////////////////

let cachedTimezoneOptions: SelectOption<string>[] | undefined;

function getTimezoneOptions(): SelectOption<string>[] {
  if (!cachedTimezoneOptions) {
    cachedTimezoneOptions = Intl.supportedValuesOf("timeZone").map((tz) => ({
      value: tz,
      label: tz,
    }));
  }
  return cachedTimezoneOptions;
}

type TimezoneSelectProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm";
};

export function TimezoneSelect(p: TimezoneSelectProps) {
  return (
    <div class="w-64 data-[width=true]:w-full" data-width={p.fullWidth}>
      <Select
        value={p.value}
        options={getTimezoneOptions()}
        onChange={p.onChange}
        label={p.label}
        intent={p.intent}
        fullWidth
        invalidMsg={p.invalidMsg}
        placeholder={p.placeholder}
        disabled={p.disabled}
        size={p.size}
      />
    </div>
  );
}

////////////////////////////////////////////////////////////////////////////////
// ZonedDateTimeInput
////////////////////////////////////////////////////////////////////////////////

type ZonedDateTimeInputProps = {
  value: ZonedDateTime;
  onChange: (v: ZonedDateTime) => void;
  dateTimeLabel?: string;
  timezoneLabel?: string;
  intent?: Intent;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

export function ZonedDateTimeInput(p: ZonedDateTimeInputProps) {
  return (
    <div>
      <div class="flex gap-4">
        <DateTimeInput
          value={p.value.dateTime}
          onChange={(dateTime) => p.onChange({ ...p.value, dateTime })}
          label={p.dateTimeLabel}
          intent={p.intent}
          disabled={p.disabled}
          size={p.size}
        />
        <TimezoneSelect
          value={p.value.timezone}
          onChange={(timezone) => p.onChange({ ...p.value, timezone })}
          label={p.timezoneLabel}
          intent={p.intent}
          disabled={p.disabled}
          size={p.size}
        />
      </div>
      <Show when={p.invalidMsg}>
        <div class="ui-text-small text-danger inline-block pt-1">
          {p.invalidMsg}
        </div>
      </Show>
    </div>
  );
}
