// ============================================================================
// DHIS2 IMPORT RUN WORKER
//
// One run = fetch + integrate per (data id, month) pair. Each pair commits
// in its own small transaction (scoped delete → insert → ledger row → run
// counters), so a run that dies at hour 40 keeps 40 hours of work, visible
// in the ledger. The run's data ids (each DHIS2 element's data element UID or
// operand) were expanded from its selected indicators at launch and travel in
// the message: the worker fetches each data id and writes its rows under that
// same key without re-resolving. The dispatcher classifies every data id per
// run from DHIS2 metadata: data elements and operands are
// fetched from dataValueSets (the values facilities reported, with no
// DHIS2-side formula), the importer's only route; a DHIS2 indicator or any
// id DHIS2 does not know is a permanent ledger error with no fetch. A pull
// selects by data element on DHIS2 2.39 and later, and by the element's
// monthly data set on an earlier release, whose export ignores dataElement=
// (the version DHIS2 reports at run start decides). Data is
// selected by the instance-calendar PERIOD ID, an opaque token the DHIS2
// server interprets in its own calendar, and the app never converts
// calendars or dates anywhere in this path (lab E13: a calendar-configured
// server does not read startDate/endDate as Gregorian, so period tokens are
// the only fleet-safe selection).
// ============================================================================

import { pooledMap } from "@std/async/pool";
import { _DHIS2_CONCURRENT_REQUESTS } from "../../exposed_env_vars.ts";
import {
  createBulkImportConnection,
  createWorkerReadConnection,
  enumerateRunPairs,
  finalizeInterruptedDatasetHmisRunVersion,
  getStoredDhis2CredentialsDecrypted,
  HMIS_DHIS2_RUN_SCOPE_TABLE_NAME,
  upsertHmisLedgerErrorPairs,
  upsertHmisLedgerPairsFromData,
} from "../../db/mod.ts";
import type {
  DatasetDhis2StagingResult,
  DatasetHmisImportRunProgress,
  DatasetHmisImportRunStats,
  Dhis2Credentials,
  Dhis2FetchErrorKind,
  Dhis2PairFetchStat,
  Dhis2PullBy,
  Dhis2RunPair,
  Dhis2RunSelection,
  PeriodIndicatorStat,
} from "lib";
import type { FetchOptions } from "../../dhis2/common/base_fetcher.ts";
import { getDhis2Version } from "../../dhis2/common/system_info.ts";
import {
  createThrottledProgressWriter,
  PROGRESS_WRITE_INTERVAL_MS,
  truncateWorkerError,
} from "../worker_contract.ts";
import {
  getChildOrgUnitIds,
  getDataValueSetsFromDHIS2,
  getDataViewRootOrgUnitIds,
  getMonthlyDataSetIdByElement,
} from "../../dhis2/goal5_data_value_sets/mod.ts";
import type {
  DHIS2DataValue,
  Dhis2ValueSelector,
} from "../../dhis2/goal5_data_value_sets/mod.ts";
import {
  buildPullTasks,
  classifyElements,
  defaultShouldRetry,
  describeFetchError,
  type DvsCoveredPair,
  type DvsPairReduction,
  type ElementRoute,
  isSplittableDvsError,
  pairKey,
  pullByForVersion,
  type PullTask,
  reduceDvsValues,
} from "./dispatch.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("DHIS2 import run worker error:", error);
    // Surfaces to the host's error listener, which terminates this worker.
    self.reportError(error);
  });
};

(self as unknown as Worker).postMessage("READY");

// ============================================================================
// CONSTANTS & TYPES
// ============================================================================

const CONCURRENT_REQUESTS = _DHIS2_CONCURRENT_REQUESTS;
// dataValueSets pulls: a dense Nigeria element-month is ~10-12 MB; the cap
// exists so a pathological response can't balloon worker memory. On cap or
// timeout the pull splits by the roots' child subtrees: never fail a pair on
// size without having tried the split.
const DVS_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const DVS_TIMEOUT_MS = 300_000;

type RunWorkerMessage = {
  runId: number;
  selection: Dhis2RunSelection;
};

type FetchAccumulator = {
  requests: number;
  retries: number;
  totalFetchMs: number;
  maxRequestMs: number;
};

function newFetchAccumulator(): FetchAccumulator {
  return { requests: 0, retries: 0, totalFetchMs: 0, maxRequestMs: 0 };
}

// ============================================================================
// MAIN ORCHESTRATION
// ============================================================================

let alreadyRunning = false;

async function run(std: RunWorkerMessage) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { runId, selection } = std;
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");
  const runStartedIso = new Date().toISOString();

  // --- Shared run state ------------------------------------------------------
  const pairFetchStats: Dhis2PairFetchStat[] = [];
  const failedFetches: Array<{
    dataId: string;
    periodId: number;
    error: string;
    errorKind: Dhis2FetchErrorKind;
  }> = [];
  let succeededPairsCount = 0;
  let failedPairsCount = 0;
  let totalRowsInserted = 0;
  let totalRowsDeleted = 0;
  let mintedVersionId: number | null = null;
  let versionPromise: Promise<number> | null = null;

  // run_stats must survive EVERY exit: inputs live at run scope so the
  // catch path can persist whatever was known when the run died.
  let statsInputs:
    | {
      dhis2Version: string;
      pullBy: Dhis2PullBy;
      routes: Map<string, ElementRoute>;
      unknownIds: string[];
      dhis2IndicatorIds: string[];
      noMonthlyDataSetIds: string[];
    }
    | null = null;
  const buildRunStatsJson = (): string | null => {
    if (!statsInputs) {
      return null;
    }
    const runStats: DatasetHmisImportRunStats = {
      dhis2Version: statsInputs.dhis2Version,
      pullBy: statsInputs.pullBy,
      classification: {
        dvsBareElements: countRoutes(
          statsInputs.routes,
          (r) => r.kind === "dvs" && r.coc === undefined,
        ),
        dvsOperands: countRoutes(
          statsInputs.routes,
          (r) => r.kind === "dvs" && r.coc !== undefined,
        ),
        unknownIds: statsInputs.unknownIds,
        dhis2IndicatorIds: statsInputs.dhis2IndicatorIds,
        noMonthlyDataSetIds: statsInputs.noMonthlyDataSetIds,
      },
      pairFetchStats,
    };
    return JSON.stringify(runStats);
  };

  const activePairs = new Map<string, Dhis2RunPair>();
  let progressPhase: "classifying" | "fetching" | "finalizing" = "classifying";

  const writeProgress = createThrottledProgressWriter<
    DatasetHmisImportRunProgress
  >(
    PROGRESS_WRITE_INTERVAL_MS,
    async (progress) => {
      // status guard: never resurrect progress on a cancelled/errored run.
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET progress = ${JSON.stringify(progress)}
        WHERE id = ${runId} AND status = 'running'
      `;
    },
  );

  const updateProgress = (force: boolean) => {
    writeProgress(
      {
        phase: progressPhase,
        activePairs: Array.from(activePairs.values()).slice(0, 20),
      },
      force,
    );
  };

  // Lazy version mint: dataset_hmis.version_id is a NOT NULL FK, so the
  // version row must exist before the first pair's insert, but minting only
  // at the first *successful* pair keeps the ruled "no empty versions"
  // property (a run where every pair fails mints nothing).
  const ensureVersion = (): Promise<number> => {
    if (!versionPromise) {
      versionPromise = (async () => {
        try {
          const id = await importDb.begin(async (sql) => {
            const maxRows = await sql<{ max: number | string | null }[]>`
              SELECT MAX(id) as max FROM dataset_hmis_versions
            `;
            const newId = Number(maxRows[0].max ?? 0) + 1;
            const placeholder = buildRunStagingResult(0);
            await sql`
              INSERT INTO dataset_hmis_versions
                (id, n_rows_total_imported, n_rows_inserted, n_rows_updated, staging_result)
              VALUES (${newId}, 0, 0, 0, ${JSON.stringify(placeholder)})
            `;
            await sql`
              UPDATE dataset_hmis_import_runs
              SET version_id = ${newId}
              WHERE id = ${runId}
            `;
            return newId;
          });
          mintedVersionId = Number(id);
          return mintedVersionId;
        } catch (e) {
          // A failed mint must not stay cached: every later pair would await
          // this same rejected promise and fail with the long-dead mint error
          // while the fetch workload burns on. Reset so the next pair retries.
          versionPromise = null;
          throw e;
        }
      })();
    }
    return versionPromise;
  };

  function buildRunStagingResult(
    totalPairs: number,
  ): DatasetDhis2StagingResult {
    return {
      kind: "dhis2",
      dateImported: runStartedIso,
      totalIndicatorPeriodCombos: totalPairs,
      successfulFetches: succeededPairsCount,
      failedFetches,
      periodIndicatorStats: [],
      finalStagingRowCount: totalRowsInserted,
      dhis2RowsDeleted: totalRowsDeleted,
      runId,
    };
  }

  // One pair succeeds: scoped delete → insert → ledger row → counters, all in
  // one small transaction. `rows` is already summed per facility.
  const integratePair = async (
    pair: Dhis2RunPair,
    { rows, skippedValues, skippedValuesSample }: DvsPairReduction,
  ): Promise<void> => {
    const versionId = await ensureVersion();
    await importDb.begin(async (sql) => {
      const del = await sql.unsafe(
        `DELETE FROM dataset_hmis dt
         USING ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME} s
         WHERE dt.facility_id = s.facility_id
           AND dt.data_id = $1 AND dt.period_id = $2`,
        [pair.dataId, pair.periodId],
      );
      totalRowsDeleted += del.count;
      if (rows.length > 0) {
        const facilityArr = rows.map((r) => r.facilityId);
        const countArr = rows.map((r) => r.count);
        await sql`
          INSERT INTO dataset_hmis
            (facility_id, data_id, period_id, count, version_id)
          SELECT t.f, ${pair.dataId}, ${pair.periodId}, t.c, ${versionId}
          FROM UNNEST(${facilityArr}::text[], ${countArr}::int[]) AS t(f, c)
        `;
        totalRowsInserted += rows.length;
      }
      await upsertHmisLedgerPairsFromData(
        sql,
        [{
          dataId: pair.dataId,
          periodId: pair.periodId,
          skipped: { values: skippedValues, sample: skippedValuesSample },
        }],
        "dhis2",
        versionId,
      );
      await sql`
        UPDATE dataset_hmis_import_runs
        SET succeeded_pairs = succeeded_pairs + 1
        WHERE id = ${runId}
      `;
    });
    succeededPairsCount++;
  };

  const failPair = async (
    pair: Dhis2RunPair,
    error: string,
    errorKind: Dhis2FetchErrorKind,
  ): Promise<void> => {
    const capped = error.slice(0, 1000);
    failedFetches.push({
      dataId: pair.dataId,
      periodId: pair.periodId,
      error: capped,
      errorKind,
    });
    failedPairsCount++;
    console.error(
      `Pair failed [${errorKind}]: ${pair.dataId} / ${pair.periodId}: ${capped}`,
    );
    try {
      await importDb.begin(async (sql) => {
        await upsertHmisLedgerErrorPairs(sql, [
          {
            dataId: pair.dataId,
            periodId: pair.periodId,
            error: capped,
            errorKind,
          },
        ]);
        await sql`
          UPDATE dataset_hmis_import_runs
          SET failed_pairs = failed_pairs + 1
          WHERE id = ${runId}
        `;
      });
    } catch (e) {
      console.error("Failed to record pair failure in ledger:", e);
    }
  };

  try {
    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 1: LOAD RUN INPUTS + FACILITY SCOPE SNAPSHOT                  │
    // └─────────────────────────────────────────────────────────────────────┘

    const runRows = await mainDb<{ status: string }[]>`
      SELECT status FROM dataset_hmis_import_runs WHERE id = ${runId}
    `;
    if (runRows.at(0)?.status !== "running") {
      throw new Error(`Run ${runId} is not in 'running' state`);
    }

    // Credentials are read + decrypted HERE, in the worker (decrypt only at
    // fetch time: the host and the scheduler tick never see the plaintext
    // password). A missing row or a changed encryption key
    // throws, and the catch below fails the run loudly.
    const credentials: Dhis2Credentials =
      await getStoredDhis2CredentialsDecrypted(mainDb);
    const baseFetchOptions: FetchOptions = { dhis2Credentials: credentials };

    // The launcher read the URL moments ago, but an admin can replace the
    // stored connection in that window: re-stamp the row with the URL this
    // run will ACTUALLY fetch so run history records the real URL.
    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET dhis2_url = ${credentials.url}
      WHERE id = ${runId} AND status = 'running'
    `;

    const facilities = await mainDb<{ facility_id: string }[]>`
      SELECT facility_id FROM facilities_hmis
      WHERE facility_id ~ '^[a-zA-Z][a-zA-Z0-9]{10}$'
    `;
    const facilityIds = facilities.map((f) => f.facility_id);
    const facilitySet = new Set(facilityIds);
    if (facilityIds.length === 0) {
      throw new Error("No DHIS2-shaped HMIS facilities found");
    }
    console.log(
      `Run ${runId}: ${facilityIds.length} DHIS2-shaped facility IDs in scope`,
    );

    // The delete-scope snapshot: every pull is reduced against exactly this
    // set, so delete-scope == fetch-scope by construction. Unlogged + fixed name:
    // at most one run exists at a time; leftovers from a crash are dropped.
    await importDb.unsafe(
      `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
    );
    await importDb.unsafe(
      `CREATE UNLOGGED TABLE ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME} (facility_id text PRIMARY KEY)`,
    );
    const SCOPE_INSERT_CHUNK = 10000;
    for (let i = 0; i < facilityIds.length; i += SCOPE_INSERT_CHUNK) {
      const chunk = facilityIds.slice(i, i + SCOPE_INSERT_CHUNK);
      await importDb.unsafe(
        `INSERT INTO ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME} (facility_id) SELECT UNNEST($1::text[])`,
        [chunk],
      );
    }

    const allPairs = enumerateRunPairs(selection);

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 2: DISPATCHER CLASSIFICATION (per run, from DHIS2 metadata)   │
    // └─────────────────────────────────────────────────────────────────────┘

    updateProgress(true);

    const metadataFetchOptions: FetchOptions = {
      ...baseFetchOptions,
      retryOptions: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000 },
    };

    const dhis2Version = await getDhis2Version(metadataFetchOptions);
    const pullBy = pullByForVersion(dhis2Version);
    if (dhis2Version === undefined || pullBy === undefined) {
      throw new Error(
        `DHIS2 reported no readable version (${
          JSON.stringify(dhis2Version)
        }): cannot choose how to select values`,
      );
    }

    const distinctDataIds = Array.from(
      new Set(allPairs.map((p) => p.dataId)),
    );
    const routes = await classifyElements(
      distinctDataIds,
      metadataFetchOptions,
    );

    const unknownReason = (
      id: string,
    ): "not_found" | "dhis2_indicator" | undefined => {
      const route = routes.get(id);
      return route?.kind === "unknown" ? route.reason : undefined;
    };
    const unknownIds = distinctDataIds.filter(
      (id) => unknownReason(id) === "not_found",
    );
    const dhis2IndicatorIds = distinctDataIds.filter(
      (id) => unknownReason(id) === "dhis2_indicator",
    );
    const dvsPairs = allPairs.filter(
      (p) => routes.get(p.dataId)?.kind === "dvs",
    );
    const dvsElementIds = Array.from(
      new Set(
        dvsPairs.flatMap((p) => {
          const route = routes.get(p.dataId);
          return route?.kind === "dvs" ? [route.dataElementId] : [];
        }),
      ),
    );
    const dataSetByElement = pullBy === "dataSet"
      ? await getMonthlyDataSetIdByElement(dvsElementIds, metadataFetchOptions)
      : new Map<string, string>();
    const noMonthlyDataSetIds = pullBy === "dataSet"
      ? distinctDataIds.filter((id) => {
        const route = routes.get(id);
        return route?.kind === "dvs" &&
          !dataSetByElement.has(route.dataElementId);
      })
      : [];
    console.log(
      `Run ${runId} classification: DHIS2 ${dhis2Version}, pulls by ${pullBy}, ` +
        `${dvsPairs.length} dvs pairs, ${unknownIds.length} unknown ids, ` +
        `${dhis2IndicatorIds.length} DHIS2 indicators, ` +
        `${noMonthlyDataSetIds.length} in no monthly data set`,
    );

    // Refused ids get no fetch: every pair becomes a permanent,
    // ledger-visible error so stale config is loud. A DHIS2 formula keeps its
    // existing data. The authoritative wording of the repair note is the
    // dispatcher bullet of SYSTEM_06_ingestion.md.
    const failEveryPairOf = async (id: string, message: string) => {
      for (const pair of allPairs.filter((p) => p.dataId === id)) {
        await failPair(pair, message, "permanent");
      }
    };
    for (const id of unknownIds) {
      await failEveryPairOf(
        id,
        `Not found in DHIS2: "${id}" matches no data element or operand ` +
          `(data element . category option combo). Ask the FASTR team to run the ` +
          `DHIS2 id repair. It keeps the data already imported.`,
      );
    }
    for (const id of dhis2IndicatorIds) {
      await failEveryPairOf(
        id,
        `"${id}" is a DHIS2 formula (what DHIS2 calls an indicator), which this importer ` +
          `does not fetch: only data elements and operands are imported as values. ` +
          `Ask the FASTR team to run the DHIS2 id repair. It keeps the data already imported.`,
      );
    }
    for (const id of noMonthlyDataSetIds) {
      await failEveryPairOf(
        id,
        `"${id}" is collected in no monthly data set in DHIS2, and this DHIS2 release ` +
          `(${dhis2Version}) serves values only by data set, so nothing can select it. ` +
          `Ask the DHIS2 administrator which monthly data set collects it. ` +
          `It keeps the data already imported.`,
      );
    }

    // The roots whole-country dataValueSets pulls descend from.
    const rootOrgUnitIds = await getDataViewRootOrgUnitIds(
      metadataFetchOptions,
    );
    if (rootOrgUnitIds.length === 0 && dvsPairs.length > 0) {
      throw new Error(
        "The DHIS2 account has no data-view organisation units: cannot run dataValueSets pulls",
      );
    }
    let splitOrgUnitIdsPromise: Promise<string[]> | null = null;
    const getSplitOrgUnitIds = () => {
      if (!splitOrgUnitIdsPromise) {
        splitOrgUnitIdsPromise = getChildOrgUnitIds(
          rootOrgUnitIds,
          metadataFetchOptions,
        );
      }
      return splitOrgUnitIdsPromise;
    };

    statsInputs = {
      dhis2Version,
      pullBy,
      routes,
      unknownIds,
      dhis2IndicatorIds,
      noMonthlyDataSetIds,
    };

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 3: BUILD FETCH TASKS                                          │
    // └─────────────────────────────────────────────────────────────────────┘

    const tasks = buildPullTasks(dvsPairs, routes, pullBy, dataSetByElement);

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 4: FETCH + INTEGRATE (per pair, pooled)                       │
    // └─────────────────────────────────────────────────────────────────────┘

    progressPhase = "fetching";
    updateProgress(true);

    // dataValueSets pull, one selector × one month, selected by the
    // instance-calendar period token: no date conversion anywhere. On
    // size/timeout, split by the roots' child subtrees: never fail a pair on
    // size without having tried the split.
    const fetchDvsValues = async (
      selector: Dhis2ValueSelector,
      periodId: number,
      orgUnits: string[],
      allowOrgSplit: boolean,
      acc: FetchAccumulator,
    ): Promise<DHIS2DataValue[]> => {
      try {
        acc.requests++;
        const requestStartMs = Date.now();
        try {
          return await getDataValueSetsFromDHIS2(
            {
              selector,
              orgUnits,
              period: String(periodId),
            },
            {
              ...baseFetchOptions,
              timeout: DVS_TIMEOUT_MS,
              maxResponseBytes: DVS_MAX_RESPONSE_BYTES,
              retryOptions: {
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                // Size/timeout never shrink on an identical retry: split by
                // subtree instead (handled by the catch below).
                shouldRetry: (error) =>
                  !isSplittableDvsError(error.message) &&
                  defaultShouldRetry(error.message),
                onRetry: (attempt, error, delayMs) => {
                  acc.retries++;
                  console.log(
                    `DHIS2 dataValueSets request failed (attempt ${attempt}): ${error.message}. ` +
                      `Retrying in ${Math.round(delayMs / 1000)}s...`,
                  );
                },
              },
            },
          );
        } finally {
          const requestMs = Date.now() - requestStartMs;
          acc.totalFetchMs += requestMs;
          acc.maxRequestMs = Math.max(acc.maxRequestMs, requestMs);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (!isSplittableDvsError(message)) {
          throw error;
        }
        if (allowOrgSplit) {
          const subtrees = await getSplitOrgUnitIds();
          if (subtrees.length > 0) {
            console.log(
              `DVS pull ${selector.kind} ${selector.id}/${periodId} too large country-wide — splitting across ${subtrees.length} child subtrees`,
            );
            const all: DHIS2DataValue[] = [];
            for (const orgUnit of subtrees) {
              const part = await fetchDvsValues(
                selector,
                periodId,
                [orgUnit],
                false,
                acc,
              );
              all.push(...part);
            }
            return all;
          }
        }
        throw error;
      }
    };

    const toPair = (covered: DvsCoveredPair): Dhis2RunPair => ({
      dataId: covered.dataId,
      periodId: covered.periodId,
    });

    const runDvsTask = async (task: PullTask): Promise<void> => {
      for (const covered of task.coveredPairs) {
        activePairs.set(pairKey(covered), toPair(covered));
      }
      updateProgress(false);

      const acc = newFetchAccumulator();
      let values: DHIS2DataValue[];
      try {
        values = await fetchDvsValues(
          task.selector,
          task.periodId,
          rootOrgUnitIds,
          true,
          acc,
        );
      } catch (error) {
        const { message, kind } = describeFetchError(error);
        for (const covered of task.coveredPairs) {
          const pair = toPair(covered);
          pairFetchStats.push({
            dataId: pair.dataId,
            periodId: pair.periodId,
            success: false,
            ...accToStat(acc),
            rowsFetched: 0,
            skippedValues: 0,
            errorKind: kind,
            error: message.slice(0, 1000),
          });
          await failPair(pair, message, kind);
          activePairs.delete(pairKey(pair));
        }
        updateProgress(true);
        return;
      }

      // period= selection means the response can only contain the requested
      // period: anything else is the server misbehaving, and silently
      // summing or silently dropping such values could integrate a wrong (or
      // wrongfully empty) pair that scope-deletes real data. Fail the pull
      // loudly instead (deterministic server property → permanent).
      const unexpectedPeriod = values.find(
        (v) => !v.deleted && v.period !== String(task.periodId),
      );
      if (unexpectedPeriod !== undefined) {
        const message =
          `dataValueSets response for ${task.selector.kind} ${task.selector.id}, period=${task.periodId} ` +
          `contained values at period "${unexpectedPeriod.period}" — treating as a failed fetch.`;
        for (const covered of task.coveredPairs) {
          const pair = toPair(covered);
          pairFetchStats.push({
            dataId: pair.dataId,
            periodId: pair.periodId,
            success: false,
            ...accToStat(acc),
            rowsFetched: values.length,
            skippedValues: 0,
            errorKind: "permanent",
            error: message,
          });
          await failPair(pair, message, "permanent");
          activePairs.delete(pairKey(pair));
        }
        updateProgress(true);
        return;
      }

      const reductions = reduceDvsValues(
        values,
        task.coveredPairs,
        facilitySet,
      );
      for (const covered of task.coveredPairs) {
        const pair = toPair(covered);
        const reduction = reductions.get(pairKey(covered))!;
        try {
          await integratePair(pair, reduction);
          pairFetchStats.push({
            dataId: pair.dataId,
            periodId: pair.periodId,
            success: true,
            ...accToStat(acc),
            rowsFetched: reduction.rows.length,
            skippedValues: reduction.skippedValues,
          });
        } catch (error) {
          const { message, kind } = describeFetchError(error);
          pairFetchStats.push({
            dataId: pair.dataId,
            periodId: pair.periodId,
            success: false,
            ...accToStat(acc),
            rowsFetched: reduction.rows.length,
            skippedValues: reduction.skippedValues,
            errorKind: kind,
            error: message.slice(0, 1000),
          });
          await failPair(pair, message, kind);
        } finally {
          activePairs.delete(pairKey(pair));
        }
      }
      updateProgress(true);
    };

    const results = pooledMap(CONCURRENT_REQUESTS, tasks, async (task) => {
      try {
        await runDvsTask(task);
      } catch (error) {
        // runDvsTask records its own pair failures; an escape here means
        // bookkeeping itself failed for the whole task.
        console.error("Fetch task failed outside pair handling:", error);
        for (const covered of task.coveredPairs) {
          const pair = toPair(covered);
          activePairs.delete(pairKey(pair));
          const { message, kind } = describeFetchError(error);
          await failPair(pair, message, kind);
        }
      }
    });
    for await (const _ of results) {
      // Drain: all handling happens inside the tasks.
    }

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 5: FINALIZE RUN                                               │
    // └─────────────────────────────────────────────────────────────────────┘

    progressPhase = "finalizing";
    updateProgress(true);

    // Edge of the "zero successful pairs ⇒ no version" ruling: the mint
    // commits before the first pair's own transaction, so that pair failing
    // (and every other pair after it) leaves an empty version row. Nothing
    // references it: succeeded_pairs increments inside each pair's
    // transaction, so delete it. Run row written FIRST here, but the
    // transaction awaits nothing but its own two statements, so a concurrent
    // progress write only waits for COMMIT (PROTOCOL_APP_WORKER_ROUTINES.md
    // "Gotchas").
    if (mintedVersionId !== null && succeededPairsCount === 0) {
      await importDb.begin(async (sql) => {
        await sql`
          UPDATE dataset_hmis_import_runs SET version_id = NULL
          WHERE id = ${runId}
        `;
        await sql`
          DELETE FROM dataset_hmis_versions WHERE id = ${mintedVersionId}
        `;
      });
      mintedVersionId = null;
    }

    if (mintedVersionId !== null) {
      const ledgerRows = await mainDb<
        {
          data_id: string;
          period_id: number;
          n_records: number;
          sum_count: string | number;
        }[]
      >`
        SELECT data_id, period_id, n_records, sum_count
        FROM dataset_hmis_import_ledger
        WHERE version_id = ${mintedVersionId}
      `;
      const periodIndicatorStats = ledgerRows.map<PeriodIndicatorStat>(
        (r) => ({
          periodId: r.period_id,
          dataId: r.data_id,
          nRecords: r.n_records,
          totalCount: Number(r.sum_count),
        }),
      );
      const stagingResult: DatasetDhis2StagingResult = {
        ...buildRunStagingResult(allPairs.length),
        periodIndicatorStats,
      };
      await importDb`
        UPDATE dataset_hmis_versions
        SET
          n_rows_total_imported = ${totalRowsInserted},
          n_rows_inserted = ${totalRowsInserted},
          n_rows_updated = 0,
          staging_result = ${JSON.stringify(stagingResult)}
        WHERE id = ${mintedVersionId}
      `;
    }

    // Drop the scope table BEFORE the status flip: the flip releases the
    // single-running claim, and a successor run may create its own
    // fixed-name scope table the moment the claim is free.
    await importDb.unsafe(
      `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
    );

    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET
        status = 'complete',
        ended_at = now(),
        progress = NULL,
        run_stats = ${buildRunStatsJson()}
      WHERE id = ${runId} AND status = 'running'
    `;

    console.log(
      `DHIS2 import run ${runId} complete: ${succeededPairsCount} pairs succeeded, ` +
        `${failedPairsCount} failed, ${totalRowsInserted} rows inserted, ` +
        `${totalRowsDeleted} stale rows deleted` +
        (mintedVersionId !== null
          ? `, version ${mintedVersionId}`
          : ", no version (zero pairs succeeded)"),
    );

    await importDb.end();
    await mainDb.end();
    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("DHIS2 import run failed:", e);
    const errorMessage = truncateWorkerError(e);
    // Drop the scope table BEFORE the status flip releases the claim (a
    // successor run creates the same fixed-name table).
    try {
      await importDb.unsafe(
        `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
      );
    } catch {
      // Ignore cleanup errors
    }
    try {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          run_stats = ${buildRunStatsJson()},
          error = ${`${errorMessage} — pairs completed before the failure are preserved in the ledger.`}
        WHERE id = ${runId} AND status = 'running'
      `;
      // Reconcile the minted version row with what actually landed (or
      // delete it if nothing did), same as the host does on cancel/sweep.
      await finalizeInterruptedDatasetHmisRunVersion(mainDb, runId);
    } catch {
      // Ignore status update errors
    }
    try {
      await importDb.end();
      await mainDb.end();
    } catch {
      // Ignore connection close errors
    }
    throw e;
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function accToStat(acc: FetchAccumulator): {
  requests: number;
  retries: number;
  totalFetchMs: number;
  maxRequestMs: number;
} {
  return {
    requests: acc.requests,
    retries: acc.retries,
    totalFetchMs: acc.totalFetchMs,
    maxRequestMs: acc.maxRequestMs,
  };
}

function countRoutes(
  routes: Map<string, ElementRoute>,
  predicate: (r: ElementRoute) => boolean,
): number {
  let n = 0;
  for (const r of routes.values()) {
    if (predicate(r)) n++;
  }
  return n;
}
