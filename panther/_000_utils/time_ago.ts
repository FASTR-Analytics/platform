// Copyright 2023-2025, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export function formatTimeAgo(date: Date, options?: TimeAgoOptions): string {
  const now = new Date();
  const secondsAgo = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (secondsAgo < 0) {
    return "in the future";
  }

  if (secondsAgo < 60) {
    return "just now";
  }

  const minutesAgo = Math.floor(secondsAgo / 60);
  if (minutesAgo < 60) {
    return formatRelativeTime(-minutesAgo, "minute", options?.locale);
  }

  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) {
    return formatRelativeTime(-hoursAgo, "hour", options?.locale);
  }

  const daysAgo = Math.floor(hoursAgo / 24);
  if (daysAgo < 7) {
    return formatRelativeTime(-daysAgo, "day", options?.locale);
  }

  const weeksAgo = Math.floor(daysAgo / 7);
  if (weeksAgo < 5) {
    return formatRelativeTime(-weeksAgo, "week", options?.locale);
  }

  const monthsAgo = Math.floor(daysAgo / 30);
  if (monthsAgo < 12) {
    return formatRelativeTime(-monthsAgo, "month", options?.locale);
  }

  const yearsAgo = Math.floor(daysAgo / 365);
  return formatRelativeTime(-yearsAgo, "year", options?.locale);
}

function formatRelativeTime(
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  locale?: string,
): string {
  const rtf = new Intl.RelativeTimeFormat(locale || "en", { numeric: "auto" });
  return rtf.format(value, unit);
}

export type TimeAgoOptions = {
  locale?: string;
};
