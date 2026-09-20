// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

import { getLanguage } from "../deps.ts";
import type { Language, ZonedDateTime } from "../deps.ts";
import type { Intent } from "../types.ts";
import { Icon } from "../icons/mod.ts";
import type { IconName } from "../icons/mod.ts";
import { getInputClasses } from "./_internal/input_classes.ts";
import { Field } from "./field.tsx";
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
// Native picker inputs (browser owns the popup, panther owns the box)
////////////////////////////////////////////////////////////////////////////////

// Native pickers have locale-dependent intrinsic widths (12-hour locales
// append " AM"/" PM"), so the field is w-fit: the input's own pr-[2.5em]
// makes the intrinsic width include the icon allowance exactly.
type NativePickerInputProps = {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  intent?: Intent;
  fullWidth?: boolean;
  invalidMsg?: string;
  disabled?: boolean;
  size?: "sm";
};

function NativePickerInput(
  p: NativePickerInputProps & {
    type: "date" | "time" | "datetime-local";
    iconName: IconName;
  },
) {
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
    <Field
      label={p.label}
      intent={p.intent}
      invalidMsg={p.invalidMsg}
      width="w-fit"
      fullWidth={p.fullWidth}
    >
      <div class="ui-form-text relative w-full">
        <input
          ref={(el) => (inputEl = el)}
          class={`ui-native-picker !pr-[2.5em] ${
            getInputClasses(p.size, false)
          }`}
          data-intent={p.intent}
          data-invalid={!!p.invalidMsg}
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
    </Field>
  );
}

export function DateInput(p: NativePickerInputProps) {
  return <NativePickerInput {...p} type="date" iconName="calendar" />;
}

export function TimeInput(p: NativePickerInputProps) {
  return <NativePickerInput {...p} type="time" iconName="clock" />;
}

function DateTimeInput(p: NativePickerInputProps) {
  return <NativePickerInput {...p} type="datetime-local" iconName="calendar" />;
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
    <Field invalidMsg={p.invalidMsg}>
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
    </Field>
  );
}
