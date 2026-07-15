// ============================================================================
// DHIS2 IMPORT SCHEDULER (PLAN_DHIS2_IMPORTER Phase 4 — C4 + C6)
//
// A ~60 s tick (started from main.ts — deliberately NOT the boot-anchored
// 24 h jobs, which would usually miss a 01:15 Lagos window). Each tick:
// skip entirely if any HMIS import operation is active; otherwise fire at
// most ONE due item — queued runs FIFO first, then due schedules.
// Serialization needs nothing new: every fire goes through the runs table's
// partial-unique 'running' claim, so a lost race just leaves the item due
// for the next tick.
//
// The unattended gate (§7 C4): NOTHING fires unattended — one-shot,
// recurring, or queued — until a run against the stored DHIS2 URL has
// shadow-verified clean (shadow_passed = true). Refusals are loud
// (last_outcome = 'refused' on schedules, status = 'error' on queued rows).
// ============================================================================

import { _INSTANCE_CALENDAR } from "../../exposed_env_vars.ts";
import type { Sql } from "postgres";
import {
  claimScheduledImportOccurrence,
  countActiveCsvAttempts,
  getEnabledScheduledImportRows,
  getInstanceDatasetsSummary,
  getOldestQueuedDatasetHmisImportRun,
  getPgConnectionFromCacheOrNew,
  getStoredDhis2CredentialsInfo,
  hasRunningDatasetHmisImportRun,
  hasShadowPassedForDhis2Url,
  launchDatasetHmisDhis2ImportRun,
  launchQueuedDatasetHmisImportRun,
  recordScheduledImportOutcome,
  refuseQueuedDatasetHmisImportRun,
  revertScheduledImportClaim,
  sweepSpentOneShotScheduledImports,
  type EnabledScheduledImportRow,
} from "../../db/mod.ts";
import type {
  Dhis2RunSelection,
  Dhis2ScheduleSelection,
  InstanceCalendar,
} from "lib";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { getWorker } from "../worker_store.ts";

const TICK_INTERVAL_MS = 60_000;

// A fire missed by more than this (server down through the window) would
// land in daytime load, and §2.7 says skipping loudly beats firing late.
export const SCHEDULE_GRACE_MS = 4 * 60 * 60 * 1000;

// Recurring fires start a deterministic few minutes inside the window so
// several instances sharing a schedule don't hit a national DHIS2 at the
// same second (thundering herd). Per-row, stable across ticks.
const JITTER_MAX_MS = 5 * 60 * 1000;

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
// A recurring row is "this cycle's turn" when the occurrence is at least
// intervalWeeks minus this tolerance after the last handled one — DST can
// make wall-clock weeks up to an hour short, so compare with slack.
const INTERVAL_TOLERANCE_MS = 12 * 60 * 60 * 1000;

// ============================================================================
// PURE TIME MATH (exported for the verification harness)
// ============================================================================

export function jitterMsForScheduleId(id: number): number {
  return ((id * 2654435761) >>> 0) % JITTER_MAX_MS;
}

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getWallClockInZone(utcMs: number, timeZone: string): WallClock {
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
// Iterative offset correction handles DST transitions; for a wall time that
// does not exist (spring-forward gap) this lands within an hour of it, which
// is far inside the 4 h grace.
export function wallTimeInZoneToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const desired = Date.UTC(year, month - 1, day, hour, minute);
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

// The most recent instant ≤ now that is `dayOfWeek` (0 = Sunday) at
// `startTime` ("HH:MM") wall time in `timeZone`.
export function mostRecentOccurrenceMs(
  nowMs: number,
  dayOfWeek: number,
  startTime: string,
  timeZone: string,
): number {
  const [hourStr, minuteStr] = startTime.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr);
  const nowWall = getWallClockInZone(nowMs, timeZone);
  // Walk back day by day over the zone's calendar (arithmetic on the wall
  // date in UTC space is safe — only the final conversion needs the zone).
  const todayUtcNoon = Date.UTC(nowWall.year, nowWall.month - 1, nowWall.day, 12);
  for (let back = 0; back <= 7; back++) {
    const candidate = new Date(todayUtcNoon - back * DAY_MS);
    if (candidate.getUTCDay() !== dayOfWeek) {
      continue;
    }
    const occ = wallTimeInZoneToUtcMs(
      candidate.getUTCFullYear(),
      candidate.getUTCMonth() + 1,
      candidate.getUTCDate(),
      hour,
      minute,
      timeZone,
    );
    if (occ <= nowMs) {
      return occ;
    }
    // Today matches the day but the start time is still ahead — keep walking
    // back to last week's occurrence.
  }
  throw new Error(
    `Could not compute an occurrence for day ${dayOfWeek} ${startTime} in ${timeZone}`,
  );
}

export type ScheduleFireDecision =
  | { action: "none" }
  | { action: "fire"; occurrenceMs: number }
  | { action: "missed"; occurrenceMs: number };

export function decideScheduleFire(
  row: Pick<
    EnabledScheduledImportRow,
    | "id"
    | "kind"
    | "runAtMs"
    | "dayOfWeek"
    | "startTime"
    | "timezone"
    | "intervalWeeks"
    | "armedAtMs"
    | "lastFiredAtMs"
  >,
  nowMs: number,
): ScheduleFireDecision {
  if (row.kind === "one_shot") {
    if (row.runAtMs === null || row.lastFiredAtMs !== null) {
      return { action: "none" };
    }
    // Armed after its own fire instant (a stale row enabled somehow —
    // setEnabled refuses this, so belt-and-braces): never due, never missed.
    if (row.runAtMs < row.armedAtMs) {
      return { action: "none" };
    }
    if (nowMs < row.runAtMs) {
      return { action: "none" };
    }
    if (nowMs <= row.runAtMs + SCHEDULE_GRACE_MS) {
      return { action: "fire", occurrenceMs: row.runAtMs };
    }
    return { action: "missed", occurrenceMs: row.runAtMs };
  }
  if (
    row.dayOfWeek === null ||
    row.startTime === null ||
    row.timezone === null ||
    row.intervalWeeks === null
  ) {
    return { action: "none" };
  }
  let occurrenceMs: number;
  try {
    occurrenceMs = mostRecentOccurrenceMs(
      nowMs,
      row.dayOfWeek,
      row.startTime,
      row.timezone,
    );
  } catch (e) {
    console.error(`Schedule ${row.id}: occurrence computation failed:`, e);
    return { action: "none" };
  }
  // Occurrences from before the row existed / was last armed (create,
  // enable, edit) are not this schedule's business — neither a fire (an
  // unattended import launching the moment a schedule is saved) nor a
  // 'missed' alarm (review finding 1). The first real occurrence is the
  // next one after arming.
  if (occurrenceMs < row.armedAtMs) {
    return { action: "none" };
  }
  if (row.lastFiredAtMs !== null && row.lastFiredAtMs >= occurrenceMs) {
    return { action: "none" };
  }
  // Not this cycle's turn (fortnightly/monthly rows skip intermediate weeks
  // silently — no 'missed', they were never due).
  if (
    row.lastFiredAtMs !== null &&
    occurrenceMs - row.lastFiredAtMs <
      row.intervalWeeks * WEEK_MS - INTERVAL_TOLERANCE_MS
  ) {
    return { action: "none" };
  }
  const jitterMs = jitterMsForScheduleId(row.id);
  if (nowMs < occurrenceMs + jitterMs) {
    return { action: "none" };
  }
  if (nowMs <= occurrenceMs + SCHEDULE_GRACE_MS) {
    return { action: "fire", occurrenceMs };
  }
  return { action: "missed", occurrenceMs };
}

// Rolling-window resolution at fire time: the current instance-calendar
// month plus the previous monthsBack months. Mirrors the client launcher's
// period arithmetic (the app models both calendars as 12 months/year).
export function currentPeriodIdForCalendar(
  calendar: InstanceCalendar,
  now: Date,
): number {
  const gregorianYear = now.getFullYear();
  const gregorianMonth = now.getMonth() + 1;
  if (calendar === "ethiopian") {
    if (gregorianMonth >= 9) {
      return (gregorianYear - 7) * 100 + (gregorianMonth - 8);
    }
    return (gregorianYear - 8) * 100 + (gregorianMonth + 4);
  }
  return gregorianYear * 100 + gregorianMonth;
}

export function minusMonthsPeriodId(periodId: number, months: number): number {
  const totalMonths =
    Math.floor(periodId / 100) * 12 + ((periodId % 100) - 1) - months;
  return Math.floor(totalMonths / 12) * 100 + (totalMonths % 12) + 1;
}

export function resolveRollingSelection(selection: {
  rawIndicatorIds: string[];
  monthsBack: number;
}): Dhis2RunSelection {
  const endPeriod = currentPeriodIdForCalendar(_INSTANCE_CALENDAR, new Date());
  return {
    kind: "window",
    rawIndicatorIds: selection.rawIndicatorIds,
    // monthsBack is inclusive of the current month (matches the viz editor's
    // last_n_months filter: min = max - (nMonths - 1)) — monthsBack=12 means
    // 12 months total, not the current month plus 12 more.
    startPeriod: minusMonthsPeriodId(endPeriod, selection.monthsBack - 1),
    endPeriod,
  };
}

export function resolveScheduleSelection(
  selection: Dhis2ScheduleSelection,
): Dhis2RunSelection {
  if (selection.kind === "explicit_range") {
    return {
      kind: "window",
      rawIndicatorIds: selection.rawIndicatorIds,
      startPeriod: selection.startPeriod,
      endPeriod: selection.endPeriod,
    };
  }
  return resolveRollingSelection(selection);
}

// ============================================================================
// THE TICK
// ============================================================================

let tickInFlight = false;

export function startDhis2ImportScheduler(): void {
  setInterval(() => {
    tickDhis2ImportScheduler().catch((e) => {
      console.error("DHIS2 import scheduler tick failed:", e);
    });
  }, TICK_INTERVAL_MS);
}

export async function tickDhis2ImportScheduler(): Promise<void> {
  if (tickInFlight) {
    return;
  }
  tickInFlight = true;
  try {
    const mainDb = getPgConnectionFromCacheOrNew("main", "READ_AND_WRITE");

    // Spent-one-shot sweep (§0 lifecycle table): runs every tick, even when
    // the import slot is busy — it only deletes rows whose story has ended.
    const swept = await sweepSpentOneShotScheduledImports(mainDb);
    if (swept > 0) {
      await notifyDatasets(mainDb);
    }

    // Skip entirely while any HMIS import operation is active — queued items
    // and due schedules wait their turn (C6: queue, not concurrency).
    if (getWorker("hmis") || getWorker("hmis_dhis2_run")) {
      return;
    }
    if (await hasRunningDatasetHmisImportRun(mainDb)) {
      return;
    }
    if ((await countActiveCsvAttempts(mainDb)) > 0) {
      return;
    }

    // 1. Queued runs, FIFO.
    const queued = await getOldestQueuedDatasetHmisImportRun(mainDb);
    if (queued) {
      await fireQueuedRun(mainDb, queued);
      return;
    }

    // 2. Due schedules (misses are recorded for every overdue row; at most
    // ONE row actually fires per tick).
    const schedules = await getEnabledScheduledImportRows(mainDb);
    const nowMs = Date.now();
    for (const schedule of schedules) {
      const decision = decideScheduleFire(schedule, nowMs);
      if (decision.action === "missed") {
        const claimed = await claimScheduledImportOccurrence(
          mainDb,
          schedule.id,
          decision.occurrenceMs,
        );
        if (claimed) {
          console.warn(
            `Schedule ${schedule.id}: occurrence ${new Date(decision.occurrenceMs).toISOString()} missed (window + grace passed)`,
          );
          await recordScheduledImportOutcome(mainDb, schedule.id, {
            outcome: "missed",
            error:
              "The scheduled window passed while the server was unavailable or the import slot was busy. Skipped rather than firing late into daytime load.",
            disable: schedule.kind === "one_shot",
          });
          await notifyDatasets(mainDb);
        }
        continue;
      }
      if (decision.action === "fire") {
        await fireSchedule(mainDb, schedule, decision.occurrenceMs);
        return;
      }
    }
  } finally {
    tickInFlight = false;
  }
}

async function notifyDatasets(mainDb: Sql): Promise<void> {
  try {
    notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(mainDb));
  } catch (e) {
    console.error("Scheduler datasets notify failed:", e);
  }
}

async function fireQueuedRun(
  mainDb: Sql,
  queued: { id: number; dhis2Url: string; selection: Dhis2RunSelection },
): Promise<void> {
  const stored = await getStoredDhis2CredentialsInfo(mainDb);
  if (!stored) {
    await refuseQueuedDatasetHmisImportRun(
      mainDb,
      queued.id,
      "Refused: no stored DHIS2 credentials. Save credentials in the DHIS2 imports view and queue the import again.",
    );
    await notifyDatasets(mainDb);
    return;
  }
  if (stored.url !== queued.dhis2Url) {
    await refuseQueuedDatasetHmisImportRun(
      mainDb,
      queued.id,
      `Refused: the stored DHIS2 connection changed after this import was queued (was ${queued.dhis2Url}, now ${stored.url}). Queue the import again.`,
    );
    await notifyDatasets(mainDb);
    return;
  }
  if (!(await hasShadowPassedForDhis2Url(mainDb, stored.url))) {
    await refuseQueuedDatasetHmisImportRun(
      mainDb,
      queued.id,
      `Refused: unattended imports are blocked until an import against ${stored.url} has shadow-verified cleanly. Run an import directly first.`,
    );
    await notifyDatasets(mainDb);
    return;
  }
  const launched = await launchQueuedDatasetHmisImportRun(mainDb, {
    runId: queued.id,
    selection: queued.selection,
    onComplete: async () => {
      await notifyDatasets(mainDb);
    },
  });
  if (launched) {
    console.log(`Scheduler: launched queued DHIS2 import run ${queued.id}`);
    await notifyDatasets(mainDb);
  }
}

async function fireSchedule(
  mainDb: Sql,
  schedule: EnabledScheduledImportRow,
  occurrenceMs: number,
): Promise<void> {
  const claimed = await claimScheduledImportOccurrence(
    mainDb,
    schedule.id,
    occurrenceMs,
  );
  if (!claimed) {
    return;
  }
  const disable = schedule.kind === "one_shot";

  const stored = await getStoredDhis2CredentialsInfo(mainDb);
  if (!stored) {
    await recordScheduledImportOutcome(mainDb, schedule.id, {
      outcome: "refused",
      error:
        "No stored DHIS2 credentials. Save credentials in the DHIS2 imports view.",
      disable,
    });
    await notifyDatasets(mainDb);
    return;
  }
  if (!(await hasShadowPassedForDhis2Url(mainDb, stored.url))) {
    await recordScheduledImportOutcome(mainDb, schedule.id, {
      outcome: "refused",
      error:
        `Unattended imports are blocked until an import against ${stored.url} has shadow-verified cleanly. Run an import directly first.`,
      disable,
    });
    await notifyDatasets(mainDb);
    return;
  }

  const selection = resolveScheduleSelection(schedule.selection);
  const res = await launchDatasetHmisDhis2ImportRun(mainDb, {
    credentialsSource: { kind: "stored" },
    dhis2Url: stored.url,
    selection,
    trigger: "schedule",
    triggeredBy: schedule.createdBy,
    onComplete: async () => {
      await notifyDatasets(mainDb);
    },
  });
  if (res.success) {
    console.log(
      `Scheduler: launched run ${res.data.runId} for schedule ${schedule.id}`,
    );
    await recordScheduledImportOutcome(mainDb, schedule.id, {
      outcome: "launched",
      runId: res.data.runId,
      disable,
    });
    await notifyDatasets(mainDb);
    return;
  }
  // A launch that lost only the import-slot race — a run OR a CSV attempt
  // claiming it between the tick's idle check and the launch guards — stays
  // due: release the occurrence so the next tick retries (within grace; past
  // grace it becomes a truthful 'missed'). Anything else is deterministic
  // and records a loud refusal. The revert is conditional on the row still
  // holding this tick's claim, so it can never clobber a concurrent edit's
  // re-arm (review finding 4 + CAS-revert low).
  if (
    (await hasRunningDatasetHmisImportRun(mainDb)) ||
    (await countActiveCsvAttempts(mainDb)) > 0
  ) {
    await revertScheduledImportClaim(
      mainDb,
      schedule.id,
      occurrenceMs,
      schedule.lastFiredAtMs,
    );
    return;
  }
  await recordScheduledImportOutcome(mainDb, schedule.id, {
    outcome: "refused",
    error: res.err,
    disable,
  });
  await notifyDatasets(mainDb);
}
