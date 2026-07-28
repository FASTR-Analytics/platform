// Copyright 2023-2026, Tim Roberton, All rights reserved.
//
// ⚠️  EXTERNAL LIBRARY - Auto-synced from timroberton-panther
// ⚠️  DO NOT EDIT - Changes will be overwritten on next sync

export type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type ZonedDateTime = {
  dateTime: string;
  timezone: string;
};

export function getWallClockInZone(
  utcMs: number,
  timeZone: string,
): WallClock {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");
  // "24" appears for midnight in some ICU versions.
  const rawHour = get("hour");
  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: rawHour === 24 ? 0 : rawHour,
    minute: get("minute"),
    second: get("second"),
  };
}

function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const wall = getWallClockInZone(utcMs, timeZone);
  const asUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  // Drop sub-second remainder so the round-trip is exact.
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

// The UTC instant at which the given wall time occurs in the given zone.
// Iterative offset correction handles DST transitions; a wall time that does
// not exist (spring-forward gap) resolves to within an hour of the named time
// rather than throwing.
export function wallTimeInZoneToUtcMs(
  wall: Omit<WallClock, "second"> & { second?: number },
  timeZone: string,
): number {
  const desired = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second ?? 0,
  );
  let guess = desired;
  for (let i = 0; i < 3; i++) {
    const offset = zoneOffsetMs(guess, timeZone);
    const next = desired - offset;
    if (next === guess) {
      break;
    }
    guess = next;
  }
  return guess;
}

const ZONED_DATE_TIME_REGEX = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

export function zonedDateTimeToUtcMs(v: ZonedDateTime): number {
  const m = v.dateTime.match(ZONED_DATE_TIME_REGEX);
  if (!m) {
    throw new Error(
      `Invalid ZonedDateTime dateTime (expected "YYYY-MM-DDTHH:mm"): ${v.dateTime}`,
    );
  }
  return wallTimeInZoneToUtcMs(
    {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      hour: Number(m[4]),
      minute: Number(m[5]),
    },
    v.timezone,
  );
}

export function zonedDateTimeToUtcIso(v: ZonedDateTime): string {
  return new Date(zonedDateTimeToUtcMs(v)).toISOString();
}

export function utcMsToZonedDateTime(
  utcMs: number,
  timezone: string,
): ZonedDateTime {
  const w = getWallClockInZone(utcMs, timezone);
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    dateTime: `${w.year}-${pad(w.month)}-${pad(w.day)}T${pad(w.hour)}:${
      pad(w.minute)
    }`,
    timezone,
  };
}

export function getLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
