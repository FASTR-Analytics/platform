// The import an applied plan leaves to do: one manual DHIS2 import run over
// every Sum and calculated indicator whose rows the apply deleted and every
// Sum it rewrote, queued as the import wizard queues one. The server's
// scheduler starts it, so the run lives in the server's process: the app's
// Cancel reaches it and connected clients hear when it starts and ends.

import type { Sql } from "postgres";
import {
  type DatasetHmisImportRunDetail,
  type Dhis2WindowSelectionInput,
  parseJsonOrThrow,
} from "lib";
import {
  enqueueDatasetHmisImportRun,
  getDatasetHmisImportRunDetail,
} from "../db/instance/dataset_hmis_import_runs.ts";
import { assertPlanConnection } from "./execute.ts";
import type { Dhis2IdFixPlan } from "./plan.ts";

export const DHIS2_ID_FIX_BACKFILL_TRIGGERED_BY = "dhis2-id-repair";

const RUN_POLL_INTERVAL_MS = 10_000;

// What the backfill reads of an applied plan file, and all it requires of
// one, so a file written before the plan gained a field still serves.
export type Dhis2IdFixBackfillInput = Pick<
  Dhis2IdFixPlan,
  "dhis2Url" | "actions" | "sumRewrites"
>;

export function readDhis2IdFixBackfillFile(
  text: string,
): Dhis2IdFixBackfillInput {
  const parsed = parseJsonOrThrow<unknown>(text);
  const v = typeof parsed === "object" && parsed !== null
    ? parsed as Record<string, unknown>
    : {};
  if (
    typeof v.dhis2Url !== "string" || !Array.isArray(v.actions) ||
    !Array.isArray(v.sumRewrites)
  ) {
    throw new Error("The input is not a plan file written by `plan`");
  }
  return parsed as Dhis2IdFixBackfillInput;
}

// The window runs from the earliest to the latest month the emptied
// indicators held, so it refetches everything they lost.
export function backfillSelection(
  plan: Pick<Dhis2IdFixBackfillInput, "actions" | "sumRewrites">,
): Dhis2WindowSelectionInput {
  const emptied = plan.actions.filter((a) =>
    (a.outcome === "to_sum" || a.outcome === "to_calculated") &&
    a.rows.count > 0
  );
  const firsts = emptied.flatMap((a) => a.rows.firstPeriodId ?? []);
  const lasts = emptied.flatMap((a) => a.rows.lastPeriodId ?? []);
  if (firsts.length === 0 || lasts.length === 0) {
    throw new Error(
      "The plan deleted no rows under an indicator it made a Sum or a calculated indicator, so there is nothing to backfill",
    );
  }
  return {
    kind: "window",
    indicatorIds: [
      ...emptied.map((a) => a.indicatorId),
      ...plan.sumRewrites.map((s) => s.sumId),
    ],
    startPeriod: Math.min(...firsts),
    endPeriod: Math.max(...lasts),
  };
}

// Refused, by a throw, when the plan has nothing to backfill, when the stored
// connection is missing or is not the plan's, or when the selection is
// (an indicator gone, no DHIS2-shaped facilities).
export async function queueDhis2IdFixBackfill(
  mainDb: Sql,
  plan: Dhis2IdFixBackfillInput,
): Promise<{ runId: number; selection: Dhis2WindowSelectionInput }> {
  const selection = backfillSelection(plan);
  await assertPlanConnection(mainDb, plan);
  const queued = await enqueueDatasetHmisImportRun(mainDb, {
    dhis2Url: plan.dhis2Url,
    selection,
    triggeredBy: DHIS2_ID_FIX_BACKFILL_TRIGGERED_BY,
  });
  if (!queued.success) throw new Error(queued.err);
  return { runId: queued.data.runId, selection };
}

// The run once it is neither queued nor running: complete, error (a refusal
// at start included) or cancelled.
export async function waitForDhis2IdFixBackfill(
  mainDb: Sql,
  runId: number,
): Promise<DatasetHmisImportRunDetail> {
  while (true) {
    const read = await getDatasetHmisImportRunDetail(mainDb, runId);
    if (!read.success) throw new Error(read.err);
    if (read.data.status !== "queued" && read.data.status !== "running") {
      return read.data;
    }
    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_INTERVAL_MS));
  }
}
