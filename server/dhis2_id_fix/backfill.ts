// The import an applied plan leaves to do: one manual DHIS2 import run over
// every Sum and calculated indicator whose rows the apply deleted and every
// Sum it rewrote, launched the way the import wizard launches one. The worker
// runs in the calling process, so the caller waits for it.

import type { Sql } from "postgres";
import {
  type DatasetHmisImportRunStatus,
  type Dhis2WindowSelectionInput,
  NO_STORED_DHIS2_CONNECTION,
} from "lib";
import { launchDatasetHmisDhis2ImportRun } from "../db/instance/dataset_hmis_import_runs.ts";
import { getStoredDhis2CredentialsInfo } from "../db/instance/instance_dhis2_credentials.ts";
import type { Dhis2IdFixPlan } from "./plan.ts";

export const DHIS2_ID_FIX_BACKFILL_TRIGGERED_BY = "dhis2-id-repair";

export type Dhis2IdFixBackfillRun = {
  runId: number;
  status: DatasetHmisImportRunStatus;
  succeededPairs: number;
  failedPairs: number;
  error: string | null;
};

// The window runs from the earliest to the latest month the emptied
// indicators held, so it refetches everything they lost.
export function backfillSelection(
  plan: Dhis2IdFixPlan,
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

async function readRun(
  mainDb: Sql,
  runId: number,
): Promise<Dhis2IdFixBackfillRun> {
  const rows = await mainDb<
    {
      status: DatasetHmisImportRunStatus;
      succeeded_pairs: number;
      failed_pairs: number;
      error: string | null;
    }[]
  >`
    SELECT status, succeeded_pairs, failed_pairs, error
    FROM dataset_hmis_import_runs WHERE id = ${runId}
  `;
  const row = rows.at(0);
  if (row === undefined) throw new Error(`Import run ${runId} not found`);
  return {
    runId,
    status: row.status,
    succeededPairs: row.succeeded_pairs,
    failedPairs: row.failed_pairs,
    error: row.error,
  };
}

// Refused, by a throw, when the plan has nothing to backfill, when the stored
// connection is missing or is not the plan's, or when the launch is (a run in
// progress, no DHIS2-shaped facilities). `finished` settles once the worker
// has ended, by completing or by failing.
export async function launchDhis2IdFixBackfill(
  mainDb: Sql,
  plan: Dhis2IdFixPlan,
): Promise<{
  runId: number;
  selection: Dhis2WindowSelectionInput;
  finished: Promise<Dhis2IdFixBackfillRun>;
}> {
  const selection = backfillSelection(plan);
  const stored = await getStoredDhis2CredentialsInfo(mainDb);
  if (stored === null) throw new Error(NO_STORED_DHIS2_CONNECTION.en);
  if (stored.url !== plan.dhis2Url) {
    throw new Error(
      `The stored DHIS2 URL is ${JSON.stringify(stored.url)}, the plan's is ${
        JSON.stringify(plan.dhis2Url)
      }`,
    );
  }
  const ended = Promise.withResolvers<void>();
  const launched = await launchDatasetHmisDhis2ImportRun(mainDb, {
    dhis2Url: stored.url,
    selection,
    trigger: "manual",
    triggeredBy: DHIS2_ID_FIX_BACKFILL_TRIGGERED_BY,
    onComplete: () => ended.resolve(),
  });
  if (!launched.success) throw new Error(launched.err);
  const runId = launched.data.runId;
  return {
    runId,
    selection,
    finished: ended.promise.then(() => readRun(mainDb, runId)),
  };
}
