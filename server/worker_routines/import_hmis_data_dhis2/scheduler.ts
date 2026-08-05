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
// ============================================================================

import { _INSTANCE_CALENDAR } from "../../exposed_env_vars.ts";
import type { Sql } from "postgres";
import {
  claimScheduledImportOccurrence,
  getEnabledScheduledImportRows,
  getInstanceDatasetsSummary,
  getOldestQueuedDatasetHmisImportRun,
  getPgConnectionFromCacheOrNew,
  getStoredDhis2CredentialsInfo,
  hasRunningDatasetHmisImportRun,
  launchDatasetHmisDhis2ImportRun,
  launchQueuedDatasetHmisCsvImportRun,
  launchQueuedDatasetHmisImportRun,
  recordScheduledImportOutcome,
  refuseQueuedDatasetHmisImportRun,
  revertScheduledImportClaim,
  sweepSpentOneShotScheduledImports,
  type EnabledScheduledImportRow,
  type QueuedDatasetHmisImportRun,
} from "../../db/mod.ts";
import type {
  Dhis2RunSelection,
  Dhis2ScheduleRecurrence,
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

const DAY_MS = 24 * 60 * 60 * 1000;

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
// does not exist (spring-forward gap) this lands within an hour of it — on
// the EARLY side in some zones (e.g. 02:30 Pacific/Auckland → 01:30).
// Accepted: it stays far inside the 4 h grace, and the fleet's zones do not
// observe DST.
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

function parseStartTime(startTime: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = startTime.split(":");
  return { hour: Number(hourStr), minute: Number(minuteStr) };
}

// Wall dates are handled as UTC-noon instants ("YYYY-MM-DD" ↔ Date.UTC at
// 12:00): day arithmetic in that space is DST-immune, and only the final
// wall-date → instant conversion consults the zone.
function wallDateToUtcNoonMs(wallDate: string): number {
  const [y, m, d] = wallDate.split("-").map(Number);
  return Date.UTC(y, m - 1, d, 12);
}

function occurrenceAtUtcNoonMs(
  utcNoonMs: number,
  startTime: string,
  timeZone: string,
): number {
  const { hour, minute } = parseStartTime(startTime);
  const date = new Date(utcNoonMs);
  return wallTimeInZoneToUtcMs(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    hour,
    minute,
    timeZone,
  );
}

// The nth (1–4 or "last") `weekday` of the month containing `anyUtcNoonMs`,
// as a UTC-noon instant. 1st–4th always exist (day ≤ 28); "last" walks back
// from the month's final day.
function nthWeekdayOfMonthUtcNoonMs(
  anyUtcNoonMs: number,
  nth: 1 | 2 | 3 | 4 | "last",
  weekday: number,
): number {
  const date = new Date(anyUtcNoonMs);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  if (nth === "last") {
    const lastDay = Date.UTC(year, month + 1, 0, 12);
    const back = (new Date(lastDay).getUTCDay() - weekday + 7) % 7;
    return lastDay - back * DAY_MS;
  }
  const firstDay = Date.UTC(year, month, 1, 12);
  const forward = (weekday - new Date(firstDay).getUTCDay() + 7) % 7;
  return firstDay + (forward + (nth - 1) * 7) * DAY_MS;
}

// The most recent occurrence ≤ now for the recurrence, or null when none
// exists yet (anchor still in the future). Exact arithmetic from the
// anchor — cadence phase never depends on when the schedule last fired.
export function mostRecentOccurrenceMs(
  nowMs: number,
  recurrence: Dhis2ScheduleRecurrence,
): number | null {
  const nowWall = getWallClockInZone(nowMs, recurrence.timezone);
  const todayUtcNoon = Date.UTC(nowWall.year, nowWall.month - 1, nowWall.day, 12);

  if (recurrence.kind === "daily") {
    const today = occurrenceAtUtcNoonMs(
      todayUtcNoon,
      recurrence.startTime,
      recurrence.timezone,
    );
    if (today <= nowMs) {
      return today;
    }
    return occurrenceAtUtcNoonMs(
      todayUtcNoon - DAY_MS,
      recurrence.startTime,
      recurrence.timezone,
    );
  }

  if (recurrence.kind === "weekly") {
    const anchorUtcNoon = wallDateToUtcNoonMs(recurrence.firstRunDate);
    const cycleDays = 7 * recurrence.everyNWeeks;
    const daysSinceAnchor = Math.round((todayUtcNoon - anchorUtcNoon) / DAY_MS);
    if (daysSinceAnchor < 0) {
      return null;
    }
    let candidateUtcNoon =
      anchorUtcNoon + Math.floor(daysSinceAnchor / cycleDays) * cycleDays * DAY_MS;
    let occ = occurrenceAtUtcNoonMs(
      candidateUtcNoon,
      recurrence.startTime,
      recurrence.timezone,
    );
    if (occ > nowMs) {
      candidateUtcNoon -= cycleDays * DAY_MS;
      if (candidateUtcNoon < anchorUtcNoon) {
        return null;
      }
      occ = occurrenceAtUtcNoonMs(
        candidateUtcNoon,
        recurrence.startTime,
        recurrence.timezone,
      );
    }
    return occ;
  }

  // monthly: candidate = the most recent month on the everyNMonths cycle
  // from anchorMonth; its occurrence is the nth weekday at startTime.
  const [anchorYear, anchorMonth] = recurrence.anchorMonth.split("-").map(Number);
  const monthsSinceAnchor =
    (nowWall.year - anchorYear) * 12 + (nowWall.month - anchorMonth);
  if (monthsSinceAnchor < 0) {
    return null;
  }
  let cycleMonths =
    monthsSinceAnchor - (monthsSinceAnchor % recurrence.everyNMonths);
  for (let i = 0; i < 2; i++) {
    if (cycleMonths < 0) {
      return null;
    }
    const monthIndex = anchorMonth - 1 + cycleMonths;
    const monthUtcNoon = Date.UTC(anchorYear, monthIndex, 1, 12);
    const occUtcNoon = nthWeekdayOfMonthUtcNoonMs(
      monthUtcNoon,
      recurrence.nth,
      recurrence.weekday,
    );
    const occ = occurrenceAtUtcNoonMs(
      occUtcNoon,
      recurrence.startTime,
      recurrence.timezone,
    );
    if (occ <= nowMs) {
      return occ;
    }
    cycleMonths -= recurrence.everyNMonths;
  }
  return null;
}

export type ScheduleFireDecision =
  | { action: "none" }
  | { action: "fire"; occurrenceMs: number }
  | { action: "missed"; occurrenceMs: number };

export function decideScheduleFire(
  row: Pick<
    EnabledScheduledImportRow,
    "id" | "kind" | "runAtMs" | "recurrence" | "armedAtMs" | "lastFiredAtMs"
  >,
  nowMs: number,
): ScheduleFireDecision {
  if (row.kind === "one_shot") {
    if (row.runAtMs === null || row.lastFiredAtMs !== null) {
      return { action: "none" };
    }
    // Armed after its own fire instant (a stale row re-enabled somehow —
    // edits re-arm and re-validate run-at, so belt-and-braces): never due,
    // never missed.
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
  if (row.recurrence === null) {
    return { action: "none" };
  }
  let occurrenceMs: number | null;
  try {
    occurrenceMs = mostRecentOccurrenceMs(nowMs, row.recurrence);
  } catch (e) {
    console.error(`Schedule ${row.id}: occurrence computation failed:`, e);
    return { action: "none" };
  }
  // null = the anchor is still in the future — nothing has ever been due.
  if (occurrenceMs === null) {
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
  queued: QueuedDatasetHmisImportRun,
): Promise<void> {
  // CSV fires need no stored-credential checks — the temp upload (or the
  // surviving per-run staging table, for an integrate-anyway resume) is the
  // whole input.
  if (queued.source === "csv") {
    const launchedCsv = await launchQueuedDatasetHmisCsvImportRun(mainDb, {
      runId: queued.id,
      onComplete: async () => {
        await notifyDatasets(mainDb);
      },
    });
    if (launchedCsv) {
      console.log(`Scheduler: launched queued CSV import run ${queued.id}`);
      await notifyDatasets(mainDb);
    }
    return;
  }

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
  // A launch that lost only the import-slot race — another run claiming it
  // between the tick's idle check and the launch guards — stays due: release
  // the occurrence so the next tick retries (within grace; past grace it
  // becomes a truthful 'missed'). Anything else is deterministic and records
  // a loud refusal. The revert is conditional on the row still holding this
  // tick's claim, so it can never clobber a concurrent edit's re-arm (review
  // finding 4 + CAS-revert low).
  if (await hasRunningDatasetHmisImportRun(mainDb)) {
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
