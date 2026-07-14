// ============================================================================
// DHIS2 IMPORT RUN WORKER (PLAN_DHIS2_IMPORTER Phase 3 — C1 + §4.4)
//
// One run = fetch + integrate per (raw indicator, month) pair. Each pair
// commits in its own small transaction (scoped delete → insert → ledger row →
// run counters), so a run that dies at hour 40 keeps 40 hours of work,
// visible in the ledger. The FETCH DISPATCHER classifies every selected raw
// indicator per run from DHIS2 metadata and routes it:
//   dataValueSets (bare elements + operands, ~1000× less server compute) or
//   analytics (computed DHIS2 indicators + non-monthly re-routes).
// Both routes emit the same output contract — (facility, indicator, period,
// count) rows — so integration, the ledger, and the UI never know which
// route fetched.
// ============================================================================

import { pooledMap } from "@std/async/pool";
import {
  _DHIS2_CONCURRENT_REQUESTS,
  _DHIS2_FACILITY_BATCH_SIZE,
} from "../../exposed_env_vars.ts";
import {
  createBulkImportConnection,
  createWorkerReadConnection,
  enumerateRunPairs,
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
  Dhis2RunPair,
  Dhis2RunRoute,
  Dhis2RunSelection,
  PeriodIndicatorRawStat,
} from "lib";
import type { FetchOptions } from "../../dhis2/common/base_fetcher.ts";
import { getAnalyticsFromDHIS2 } from "../../dhis2/goal3_analytics/mod.ts";
import type { DHIS2AnalyticsResponse } from "../../dhis2/goal3_analytics/mod.ts";
import {
  getDataValueSetsFromDHIS2,
  getOrgUnitIdsAtLevel,
} from "../../dhis2/goal5_data_value_sets/mod.ts";
import type { DHIS2DataValue } from "../../dhis2/goal5_data_value_sets/mod.ts";
import {
  assertUrlWithinLimit,
  chunkContiguousMonths,
  classifyRawIndicators,
  defaultShouldRetry,
  describeFetchError,
  isSplittableDvsError,
  isValidMonthlyPeriod,
  monthEndDate,
  monthStartDate,
  pairKey,
  type RawRoute,
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

const FACILITY_BATCH_SIZE = _DHIS2_FACILITY_BATCH_SIZE;
const CONCURRENT_REQUESTS = _DHIS2_CONCURRENT_REQUESTS;
// Nigeria's nginx returns 414 above ~8 KB (lab E3); ou:400 measured-safe.
const MAX_URL_LENGTH = 7000;
// The client polls the run row every 2 s — writing more often is pure waste.
const PROGRESS_WRITE_INTERVAL_MS = 2000;
// dataValueSets pulls: a dense Nigeria element-month is ~10-12 MB; the cap
// exists so a pathological response can't balloon worker memory. On cap or
// timeout the window halves (min 1 month), then splits by level-2 subtree —
// never fail a pair on size without having tried the splits (§4.4).
const DVS_MAX_RESPONSE_BYTES = 100 * 1024 * 1024;
const DVS_TIMEOUT_MS = 300_000;
const DVS_WINDOW_MONTHS = 3;
// Shadow verification (first dispatcher run per instance): cross-check a
// sample of DVS-routed pairs against the analytics value before integrating.
const SHADOW_SAMPLE_RATE = 0.05;
const SHADOW_MAX_PAIRS = 40;
const SHADOW_MAX_FACILITIES_WITH_DATA = 300;
const SHADOW_MAX_FACILITIES_WITHOUT_DATA = 100;

type RunWorkerMessage = {
  runId: number;
  credentials: Dhis2Credentials;
  selection: Dhis2RunSelection;
};

type DvsTask = {
  kind: "dvs";
  baseElementId: string;
  // Contiguous ascending chunk, ≤ DVS_WINDOW_MONTHS.
  periodIds: number[];
  // Every selected (raw indicator, month) this pull covers. Indicators
  // sharing a base element share one pull.
  coveredPairs: Array<{
    indicatorRawId: string;
    coc: string | undefined;
    periodId: number;
  }>;
};

type AnalyticsTask = {
  kind: "analytics";
  indicatorRawId: string;
  periodId: number;
};

type FetchTask = DvsTask | AnalyticsTask;

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

  const { runId, credentials, selection } = std;
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");
  const runStartedIso = new Date().toISOString();

  const baseFetchOptions: FetchOptions = { dhis2Credentials: credentials };

  // --- Shared run state ------------------------------------------------------
  const pairFetchStats: Dhis2PairFetchStat[] = [];
  const failedFetches: Array<{
    indicatorRawId: string;
    periodId: number;
    error: string;
    errorKind: Dhis2FetchErrorKind;
  }> = [];
  const nonMonthlyElements = new Set<string>();
  let succeededPairsCount = 0;
  let failedPairsCount = 0;
  let totalRowsInserted = 0;
  let totalRowsDeleted = 0;
  let mintedVersionId: number | null = null;
  let versionPromise: Promise<number> | null = null;

  const activePairs = new Map<
    string,
    { indicatorRawId: string; periodId: number; route: Dhis2RunRoute }
  >();
  let progressPhase: DatasetHmisImportRunProgress["phase"] = "classifying";
  let lastProgressWriteMs = 0;

  const updateProgress = async (force: boolean) => {
    const now = Date.now();
    if (!force && now - lastProgressWriteMs < PROGRESS_WRITE_INTERVAL_MS) {
      return;
    }
    lastProgressWriteMs = now;
    const progress: DatasetHmisImportRunProgress = {
      phase: progressPhase,
      activePairs: Array.from(activePairs.values()).slice(0, 20),
    };
    try {
      // status guard: never resurrect progress on a cancelled/errored run.
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET progress = ${JSON.stringify(progress)}
        WHERE id = ${runId} AND status = 'running'
      `;
    } catch (e) {
      console.error("Failed to write run progress:", e);
    }
  };

  // Lazy version mint: dataset_hmis.version_id is a NOT NULL FK, so the
  // version row must exist before the first pair's insert — but minting only
  // at the first *successful* pair keeps the ruled "no empty versions"
  // property (a run where every pair fails mints nothing).
  const ensureVersion = (): Promise<number> => {
    if (!versionPromise) {
      versionPromise = (async () => {
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
      })();
    }
    return versionPromise;
  };

  function buildRunStagingResult(totalPairs: number): DatasetDhis2StagingResult {
    return {
      sourceType: "dhis2",
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
  // one small transaction. `rows` is already deduped per facility.
  const integratePair = async (
    pair: Dhis2RunPair,
    rows: Array<{ facilityId: string; count: number }>,
  ): Promise<void> => {
    const versionId = await ensureVersion();
    await importDb.begin(async (sql) => {
      const del = await sql.unsafe(
        `DELETE FROM dataset_hmis dt
         USING ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME} s
         WHERE dt.facility_id = s.facility_id
           AND dt.indicator_raw_id = $1 AND dt.period_id = $2`,
        [pair.indicatorRawId, pair.periodId],
      );
      totalRowsDeleted += del.count;
      if (rows.length > 0) {
        const facilityArr = rows.map((r) => r.facilityId);
        const countArr = rows.map((r) => r.count);
        await sql`
          INSERT INTO dataset_hmis
            (facility_id, indicator_raw_id, period_id, count, version_id)
          SELECT t.f, ${pair.indicatorRawId}, ${pair.periodId}, t.c, ${versionId}
          FROM UNNEST(${facilityArr}::text[], ${countArr}::int[]) AS t(f, c)
        `;
        totalRowsInserted += rows.length;
      }
      await upsertHmisLedgerPairsFromData(sql, [pair], "dhis2", versionId);
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
    failedFetches.push({ ...pair, error: capped, errorKind });
    failedPairsCount++;
    console.error(
      `Pair failed [${errorKind}]: ${pair.indicatorRawId} / ${pair.periodId}: ${capped}`,
    );
    try {
      await importDb.begin(async (sql) => {
        await upsertHmisLedgerErrorPairs(sql, [
          { ...pair, error: capped, errorKind },
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

    // The delete-scope snapshot: both routes fetch against exactly this set,
    // so delete-scope == fetch-scope by construction. Unlogged + fixed name:
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

    await updateProgress(true);

    const metadataFetchOptions: FetchOptions = {
      ...baseFetchOptions,
      retryOptions: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000 },
    };

    const distinctRawIds = Array.from(
      new Set(allPairs.map((p) => p.indicatorRawId)),
    );
    const routes = await classifyRawIndicators(
      distinctRawIds,
      metadataFetchOptions,
    );

    const unknownIds = distinctRawIds.filter(
      (id) => routes.get(id)?.kind === "unknown",
    );
    const dvsPairs = allPairs.filter(
      (p) => routes.get(p.indicatorRawId)?.kind === "dvs",
    );
    const analyticsPairs = allPairs.filter(
      (p) => routes.get(p.indicatorRawId)?.kind === "analytics",
    );
    console.log(
      `Run ${runId} classification: ${dvsPairs.length} dvs pairs, ` +
        `${analyticsPairs.length} analytics pairs, ${unknownIds.length} unknown ids`,
    );

    // Dispatcher rule 4: unknown ids get no fetch — every pair becomes a
    // permanent, ledger-visible error so stale config is loud.
    for (const id of unknownIds) {
      const pairsForId = allPairs.filter((p) => p.indicatorRawId === id);
      for (const pair of pairsForId) {
        await failPair(
          pair,
          `Not found in DHIS2: "${id}" matches no data element, indicator, or operand ` +
            `(data element . category option combo). Update or remove this raw indicator.`,
          "permanent",
        );
      }
    }

    // Root org units for whole-country dataValueSets pulls.
    const rootOrgUnitIds = await getOrgUnitIdsAtLevel(1, metadataFetchOptions);
    if (rootOrgUnitIds.length === 0 && dvsPairs.length > 0) {
      throw new Error(
        "DHIS2 returned no level-1 (root) organisation units — cannot run dataValueSets pulls",
      );
    }
    let level2OrgUnitIdsPromise: Promise<string[]> | null = null;
    const getLevel2OrgUnitIds = () => {
      if (!level2OrgUnitIdsPromise) {
        level2OrgUnitIdsPromise = getOrgUnitIdsAtLevel(2, metadataFetchOptions);
      }
      return level2OrgUnitIdsPromise;
    };

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 3: SHADOW-VERIFICATION DECISION (first dispatcher run only)   │
    // └─────────────────────────────────────────────────────────────────────┘

    const priorShadowPass = await mainDb<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM dataset_hmis_import_runs WHERE shadow_passed = true
      ) as exists
    `;
    const shadowMode = !priorShadowPass[0].exists;
    const shadowSample = new Set<string>();
    if (shadowMode && dvsPairs.length > 0) {
      const target = Math.min(
        SHADOW_MAX_PAIRS,
        Math.max(1, Math.ceil(dvsPairs.length * SHADOW_SAMPLE_RATE)),
      );
      const shuffled = [...dvsPairs];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      for (const p of shuffled.slice(0, target)) {
        shadowSample.add(pairKey(p));
      }
      console.log(
        `Run ${runId}: shadow verification ON — ${shadowSample.size} of ${dvsPairs.length} dvs pairs sampled`,
      );
    }
    const shadowStats: NonNullable<DatasetHmisImportRunStats["shadow"]> = {
      pairsChecked: 0,
      facilitiesCompared: 0,
      mismatches: [],
    };
    // Soft zero-ambiguity comparisons (one side absent, other side 0) are
    // recorded but do not fail the pair; analytics-unavailable comparisons
    // block shadow_passed without failing pairs.
    let shadowUnavailableCount = 0;
    let shadowHardMismatchPairs = 0;

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 4: BUILD FETCH TASKS                                          │
    // └─────────────────────────────────────────────────────────────────────┘

    const tasks: FetchTask[] = [];

    // Group DVS pairs by base element — indicators sharing a base share pulls.
    const byBase = new Map<
      string,
      { raws: Array<{ indicatorRawId: string; coc: string | undefined }>; periodsByRaw: Map<string, Set<number>> }
    >();
    for (const pair of dvsPairs) {
      const route = routes.get(pair.indicatorRawId);
      if (route?.kind !== "dvs") continue;
      let group = byBase.get(route.baseElementId);
      if (!group) {
        group = { raws: [], periodsByRaw: new Map() };
        byBase.set(route.baseElementId, group);
      }
      if (!group.periodsByRaw.has(pair.indicatorRawId)) {
        group.raws.push({ indicatorRawId: pair.indicatorRawId, coc: route.coc });
        group.periodsByRaw.set(pair.indicatorRawId, new Set());
      }
      group.periodsByRaw.get(pair.indicatorRawId)!.add(pair.periodId);
    }
    for (const [baseElementId, group] of byBase) {
      const allPeriods = Array.from(
        new Set(
          Array.from(group.periodsByRaw.values()).flatMap((s) => Array.from(s)),
        ),
      ).sort((a, b) => a - b);
      for (const chunk of chunkContiguousMonths(allPeriods, DVS_WINDOW_MONTHS)) {
        const coveredPairs: DvsTask["coveredPairs"] = [];
        for (const raw of group.raws) {
          const rawPeriods = group.periodsByRaw.get(raw.indicatorRawId)!;
          for (const periodId of chunk) {
            if (rawPeriods.has(periodId)) {
              coveredPairs.push({ ...raw, periodId });
            }
          }
        }
        if (coveredPairs.length > 0) {
          tasks.push({ kind: "dvs", baseElementId, periodIds: chunk, coveredPairs });
        }
      }
    }

    for (const pair of analyticsPairs) {
      tasks.push({ kind: "analytics", ...pair });
    }

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 5: FETCH + INTEGRATE (per pair, pooled)                       │
    // └─────────────────────────────────────────────────────────────────────┘

    progressPhase = "fetching";
    await updateProgress(true);

    const fetchPairViaAnalytics = async (
      pair: Dhis2RunPair,
    ): Promise<{
      rows: Array<{ facilityId: string; count: number }>;
      acc: FetchAccumulator;
      rowsFetched: number;
    }> => {
      const acc = newFetchAccumulator();
      const period = String(pair.periodId);
      const perFacility = new Map<string, number>();
      let rowsFetched = 0;
      for (let i = 0; i < facilityIds.length; i += FACILITY_BATCH_SIZE) {
        const facilityBatch = facilityIds.slice(i, i + FACILITY_BATCH_SIZE);
        assertUrlWithinLimit({
          rawIndicatorId: pair.indicatorRawId,
          period,
          facilityBatch,
          credentials,
          maxUrlLength: MAX_URL_LENGTH,
          facilityBatchSize: FACILITY_BATCH_SIZE,
        });
        acc.requests++;
        const requestStartMs = Date.now();
        let response: DHIS2AnalyticsResponse<string[]>;
        try {
          response = await getAnalyticsFromDHIS2<string[]>(
            {
              dataElements: [pair.indicatorRawId],
              orgUnits: facilityBatch,
              periods: [period],
              skipMeta: true,
            },
            {
              ...baseFetchOptions,
              retryOptions: {
                // Retries never rescue a pathological analytics query (lab
                // E10): fail fast, re-run the pair later via the checklist.
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 60000,
                onRetry: (attempt, error, delayMs) => {
                  acc.retries++;
                  console.log(
                    `DHIS2 analytics request failed (attempt ${attempt}): ${error.message}. ` +
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
        if (!response.rows) {
          throw new Error(
            `DHIS2 analytics response for ${pair.indicatorRawId}, period ${period} is ` +
              `missing "rows" — treating as a failed fetch, not empty data.`,
          );
        }
        rowsFetched += response.rows.length;
        if (response.rows.length > 0) {
          const orgUnitIndex = response.headers.findIndex(
            (h) => h.name === "ou" || h.name === "Organisation unit",
          );
          const valueIndex = response.headers.findIndex(
            (h) => h.name === "value" || h.name === "Value",
          );
          if (orgUnitIndex >= 0 && valueIndex >= 0) {
            for (const row of response.rows) {
              const facilityId = row[orgUnitIndex];
              const value = parseInt(row[valueIndex]);
              if (facilityId && !isNaN(value) && value >= 0) {
                perFacility.set(facilityId, value);
              }
            }
          }
        }
      }
      const rows = Array.from(perFacility, ([facilityId, count]) => ({
        facilityId,
        count,
      }));
      return { rows, acc, rowsFetched };
    };

    const runAnalyticsPair = async (pair: Dhis2RunPair): Promise<void> => {
      const key = pairKey(pair);
      activePairs.set(key, { ...pair, route: "analytics" });
      await updateProgress(false);
      try {
        const { rows, acc, rowsFetched } = await fetchPairViaAnalytics(pair);
        await integratePair(pair, rows);
        pairFetchStats.push({
          ...pair,
          success: true,
          route: "analytics",
          ...accToStat(acc),
          rowsFetched,
        });
      } catch (error) {
        const { message, kind } = describeFetchError(error);
        pairFetchStats.push({
          ...pair,
          success: false,
          route: "analytics",
          ...accToStat(newFetchAccumulator()),
          rowsFetched: 0,
          errorKind: kind,
          error: message.slice(0, 1000),
        });
        await failPair(pair, message, kind);
      } finally {
        activePairs.delete(key);
        await updateProgress(true);
      }
    };

    // Adaptive dataValueSets pull (§4.4): full window → halve months → split
    // by level-2 subtree. Never fails on size without having tried the splits.
    const fetchDvsValues = async (
      baseElementId: string,
      periodIds: number[],
      orgUnits: string[],
      allowOrgSplit: boolean,
      acc: FetchAccumulator,
    ): Promise<DHIS2DataValue[]> => {
      try {
        acc.requests++;
        const requestStartMs = Date.now();
        try {
          const res = await getDataValueSetsFromDHIS2(
            {
              dataElement: baseElementId,
              orgUnits,
              startDate: monthStartDate(periodIds[0]),
              endDate: monthEndDate(periodIds[periodIds.length - 1]),
            },
            {
              ...baseFetchOptions,
              timeout: DVS_TIMEOUT_MS,
              maxResponseBytes: DVS_MAX_RESPONSE_BYTES,
              retryOptions: {
                maxAttempts: 3,
                initialDelayMs: 1000,
                maxDelayMs: 30000,
                // Size/timeout never shrink on an identical retry — split the
                // window instead (handled by the catch below).
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
          return res.dataValues ?? [];
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
        if (periodIds.length > 1) {
          const mid = Math.ceil(periodIds.length / 2);
          console.log(
            `DVS pull ${baseElementId} too large for ${periodIds.length} months — halving window`,
          );
          const left = await fetchDvsValues(
            baseElementId,
            periodIds.slice(0, mid),
            orgUnits,
            allowOrgSplit,
            acc,
          );
          const right = await fetchDvsValues(
            baseElementId,
            periodIds.slice(mid),
            orgUnits,
            allowOrgSplit,
            acc,
          );
          return left.concat(right);
        }
        if (allowOrgSplit) {
          const level2 = await getLevel2OrgUnitIds();
          if (level2.length > 0) {
            console.log(
              `DVS pull ${baseElementId} too large for 1 month country-wide — splitting across ${level2.length} level-2 subtrees`,
            );
            const all: DHIS2DataValue[] = [];
            for (const orgUnit of level2) {
              const part = await fetchDvsValues(
                baseElementId,
                periodIds,
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

    const runDvsTask = async (task: DvsTask): Promise<void> => {
      // Element already flagged non-monthly by an earlier chunk → straight to
      // analytics (rule 5).
      if (nonMonthlyElements.has(task.baseElementId)) {
        for (const covered of task.coveredPairs) {
          await runAnalyticsPair({
            indicatorRawId: covered.indicatorRawId,
            periodId: covered.periodId,
          });
        }
        return;
      }

      for (const covered of task.coveredPairs) {
        activePairs.set(pairKey(covered), {
          indicatorRawId: covered.indicatorRawId,
          periodId: covered.periodId,
          route: "dvs",
        });
      }
      await updateProgress(false);

      const acc = newFetchAccumulator();
      let values: DHIS2DataValue[];
      try {
        values = await fetchDvsValues(
          task.baseElementId,
          task.periodIds,
          rootOrgUnitIds,
          true,
          acc,
        );
      } catch (error) {
        const { message, kind } = describeFetchError(error);
        for (const covered of task.coveredPairs) {
          const pair = {
            indicatorRawId: covered.indicatorRawId,
            periodId: covered.periodId,
          };
          pairFetchStats.push({
            ...pair,
            success: false,
            route: "dvs",
            ...accToStat(acc),
            rowsFetched: 0,
            errorKind: kind,
            error: message.slice(0, 1000),
          });
          await failPair(pair, message, kind);
          activePairs.delete(pairKey(pair));
        }
        await updateProgress(true);
        return;
      }

      // Rule 5: any non-monthly period id → never sum sub-monthly values into
      // months ourselves; discard the pull and re-route this element to the
      // analytics engine (which owns DHIS2's period-allocation rules).
      const hasNonMonthly = values.some(
        (v) => !v.deleted && !isValidMonthlyPeriod(v.period),
      );
      if (hasNonMonthly) {
        console.warn(
          `Non-monthly period ids observed for element ${task.baseElementId} — re-routing to analytics`,
        );
        nonMonthlyElements.add(task.baseElementId);
        for (const covered of task.coveredPairs) {
          activePairs.delete(pairKey(covered));
        }
        for (const covered of task.coveredPairs) {
          await runAnalyticsPair({
            indicatorRawId: covered.indicatorRawId,
            periodId: covered.periodId,
          });
        }
        return;
      }

      // Client-side reduce: keep rows whose orgUnit is in the facility scope
      // and whose period is a selected month; skip deleted values; for bare
      // elements sum across COC×AOC, for operands restrict to the COC first.
      const perPair = new Map<string, Map<string, number>>();
      for (const covered of task.coveredPairs) {
        perPair.set(pairKey(covered), new Map());
      }
      const coveredByPeriod = new Map<number, DvsTask["coveredPairs"]>();
      for (const covered of task.coveredPairs) {
        const list = coveredByPeriod.get(covered.periodId) ?? [];
        list.push(covered);
        coveredByPeriod.set(covered.periodId, list);
      }
      for (const v of values) {
        if (v.deleted) continue;
        if (!facilitySet.has(v.orgUnit)) continue;
        const periodId = parseInt(v.period);
        const coveredList = coveredByPeriod.get(periodId);
        if (!coveredList) continue;
        const value = Number(v.value);
        if (isNaN(value)) continue;
        for (const covered of coveredList) {
          if (covered.coc !== undefined && v.categoryOptionCombo !== covered.coc) {
            continue;
          }
          const facilityMap = perPair.get(pairKey(covered))!;
          facilityMap.set(
            v.orgUnit,
            (facilityMap.get(v.orgUnit) ?? 0) + value,
          );
        }
      }

      for (const covered of task.coveredPairs) {
        const pair = {
          indicatorRawId: covered.indicatorRawId,
          periodId: covered.periodId,
        };
        const facilityMap = perPair.get(pairKey(covered))!;
        // Truncate the SUM (not the addends) and drop negative totals —
        // matches how the analytics route parseInt-truncates the aggregate
        // and drops negatives, so the dispatcher changes where numbers come
        // from, not what they mean.
        const stagedMap = new Map<string, number>();
        for (const [facilityId, sum] of facilityMap) {
          const truncated = Math.trunc(sum);
          if (Number.isFinite(truncated) && truncated >= 0) {
            stagedMap.set(facilityId, truncated);
          }
        }

        try {
          if (shadowSample.has(pairKey(pair))) {
            const verdict = await shadowVerifyPair(pair, stagedMap);
            if (verdict === "analytics-unavailable") {
              shadowUnavailableCount++;
            } else {
              shadowStats.pairsChecked++;
              shadowStats.facilitiesCompared += verdict.comparisons;
              shadowStats.mismatches.push(...verdict.hardMismatches);
              shadowStats.mismatches.push(...verdict.softMismatches);
              if (verdict.hardMismatches.length > 0) {
                shadowHardMismatchPairs++;
                const first = verdict.hardMismatches[0];
                await failPair(
                  pair,
                  `Shadow verification mismatch (dataValueSets vs analytics): facility ` +
                    `${first.facilityId} dvs=${first.dvsValue} analytics=${first.analyticsValue}` +
                    (verdict.hardMismatches.length > 1
                      ? ` (+${verdict.hardMismatches.length - 1} more facilities)`
                      : ""),
                  "permanent",
                );
                pairFetchStats.push({
                  ...pair,
                  success: false,
                  route: "dvs",
                  ...accToStat(acc),
                  rowsFetched: stagedMap.size,
                  errorKind: "permanent",
                  error: "Shadow verification mismatch",
                });
                continue;
              }
            }
          }
          const rows = Array.from(stagedMap, ([facilityId, count]) => ({
            facilityId,
            count,
          }));
          await integratePair(pair, rows);
          pairFetchStats.push({
            ...pair,
            success: true,
            route: "dvs",
            ...accToStat(acc),
            rowsFetched: rows.length,
          });
        } catch (error) {
          const { message, kind } = describeFetchError(error);
          pairFetchStats.push({
            ...pair,
            success: false,
            route: "dvs",
            ...accToStat(acc),
            rowsFetched: stagedMap.size,
            errorKind: kind,
            error: message.slice(0, 1000),
          });
          await failPair(pair, message, kind);
        } finally {
          activePairs.delete(pairKey(pair));
        }
      }
      await updateProgress(true);
    };

    // Shadow verification: one analytics call over ≤400 sampled facilities
    // (up to 300 with DVS data + up to 100 without), per-facility comparison.
    const shadowVerifyPair = async (
      pair: Dhis2RunPair,
      stagedMap: Map<string, number>,
    ): Promise<
      | "analytics-unavailable"
      | {
          comparisons: number;
          hardMismatches: NonNullable<
            DatasetHmisImportRunStats["shadow"]
          >["mismatches"];
          softMismatches: NonNullable<
            DatasetHmisImportRunStats["shadow"]
          >["mismatches"];
        }
    > => {
      const withData = Array.from(stagedMap.keys());
      for (let i = withData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [withData[i], withData[j]] = [withData[j], withData[i]];
      }
      const sample = withData.slice(0, SHADOW_MAX_FACILITIES_WITH_DATA);
      const withoutData: string[] = [];
      let attempts = 0;
      while (
        withoutData.length < SHADOW_MAX_FACILITIES_WITHOUT_DATA &&
        attempts < SHADOW_MAX_FACILITIES_WITHOUT_DATA * 20
      ) {
        attempts++;
        const candidate =
          facilityIds[Math.floor(Math.random() * facilityIds.length)];
        if (!stagedMap.has(candidate) && !withoutData.includes(candidate)) {
          withoutData.push(candidate);
        }
      }
      const allSampled = sample.concat(withoutData).slice(0, 400);
      if (allSampled.length === 0) {
        return { comparisons: 0, hardMismatches: [], softMismatches: [] };
      }
      let response: DHIS2AnalyticsResponse<string[]>;
      try {
        response = await getAnalyticsFromDHIS2<string[]>(
          {
            dataElements: [pair.indicatorRawId],
            orgUnits: allSampled,
            periods: [String(pair.periodId)],
            skipMeta: true,
          },
          {
            ...baseFetchOptions,
            retryOptions: { maxAttempts: 3, initialDelayMs: 1000, maxDelayMs: 30000 },
          },
        );
        if (!response.rows) {
          return "analytics-unavailable";
        }
      } catch (error) {
        console.warn(
          `Shadow verification analytics call failed for ${pair.indicatorRawId}/${pair.periodId}:`,
          error instanceof Error ? error.message : error,
        );
        return "analytics-unavailable";
      }
      const analyticsMap = new Map<string, number>();
      const orgUnitIndex = response.headers.findIndex(
        (h) => h.name === "ou" || h.name === "Organisation unit",
      );
      const valueIndex = response.headers.findIndex(
        (h) => h.name === "value" || h.name === "Value",
      );
      if (orgUnitIndex >= 0 && valueIndex >= 0) {
        for (const row of response.rows) {
          const facilityId = row[orgUnitIndex];
          const value = parseInt(row[valueIndex]);
          if (facilityId && !isNaN(value) && value >= 0) {
            analyticsMap.set(facilityId, value);
          }
        }
      }
      const hardMismatches: NonNullable<
        DatasetHmisImportRunStats["shadow"]
      >["mismatches"] = [];
      const softMismatches: NonNullable<
        DatasetHmisImportRunStats["shadow"]
      >["mismatches"] = [];
      for (const facilityId of allSampled) {
        const dvsValue = stagedMap.get(facilityId);
        const analyticsValue = analyticsMap.get(facilityId);
        if (dvsValue === analyticsValue) continue;
        const record = { ...pair, facilityId, dvsValue, analyticsValue };
        // Zero-vs-absent is ambiguous between the two endpoints (a stored 0
        // may or may not produce an analytics row) — recorded, not fatal.
        if (
          (dvsValue === undefined && analyticsValue === 0) ||
          (analyticsValue === undefined && dvsValue === 0)
        ) {
          softMismatches.push(record);
        } else {
          hardMismatches.push(record);
        }
      }
      return { comparisons: allSampled.length, hardMismatches, softMismatches };
    };

    const results = pooledMap(CONCURRENT_REQUESTS, tasks, async (task) => {
      try {
        if (task.kind === "dvs") {
          await runDvsTask(task);
        } else {
          await runAnalyticsPair({
            indicatorRawId: task.indicatorRawId,
            periodId: task.periodId,
          });
        }
      } catch (error) {
        // runDvsTask/runAnalyticsPair record their own pair failures; an
        // escape here means bookkeeping itself failed for the whole task.
        console.error("Fetch task failed outside pair handling:", error);
        const covered =
          task.kind === "dvs"
            ? task.coveredPairs.map((c) => ({
                indicatorRawId: c.indicatorRawId,
                periodId: c.periodId,
              }))
            : [{ indicatorRawId: task.indicatorRawId, periodId: task.periodId }];
        for (const pair of covered) {
          activePairs.delete(pairKey(pair));
          const { message, kind } = describeFetchError(error);
          await failPair(pair, message, kind);
        }
      }
    });
    for await (const _ of results) {
      // Drain — all handling happens inside the tasks.
    }

    // ┌─────────────────────────────────────────────────────────────────────┐
    // │ PHASE 6: FINALIZE RUN                                               │
    // └─────────────────────────────────────────────────────────────────────┘

    progressPhase = "finalizing";
    await updateProgress(true);

    if (mintedVersionId !== null) {
      const ledgerRows = await mainDb<
        {
          indicator_raw_id: string;
          period_id: number;
          n_records: number;
          sum_count: string | number;
        }[]
      >`
        SELECT indicator_raw_id, period_id, n_records, sum_count
        FROM dataset_hmis_import_ledger
        WHERE version_id = ${mintedVersionId}
      `;
      const periodIndicatorStats = ledgerRows.map<PeriodIndicatorRawStat>(
        (r) => ({
          periodId: r.period_id,
          indicatorRawId: r.indicator_raw_id,
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

    const shadowPassed = shadowMode
      ? shadowStats.pairsChecked > 0 &&
        shadowHardMismatchPairs === 0 &&
        shadowUnavailableCount === 0
      : null;
    const runStats: DatasetHmisImportRunStats = {
      classification: {
        dvsBareElements: countRoutes(routes, (r) =>
          r.kind === "dvs" && r.coc === undefined
        ),
        dvsOperands: countRoutes(routes, (r) =>
          r.kind === "dvs" && r.coc !== undefined
        ),
        computedIndicators: countRoutes(routes, (r) => r.kind === "analytics"),
        unknownIds,
        nonMonthlyElements: Array.from(nonMonthlyElements),
      },
      pairFetchStats,
      shadow: shadowMode ? shadowStats : undefined,
    };

    await mainDb`
      UPDATE dataset_hmis_import_runs
      SET
        status = 'complete',
        ended_at = now(),
        progress = NULL,
        shadow_passed = ${shadowPassed},
        run_stats = ${JSON.stringify(runStats)}
      WHERE id = ${runId} AND status = 'running'
    `;

    await importDb.unsafe(
      `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
    );

    console.log(
      `DHIS2 import run ${runId} complete: ${succeededPairsCount} pairs succeeded, ` +
        `${failedPairsCount} failed, ${totalRowsInserted} rows inserted, ` +
        `${totalRowsDeleted} stale rows deleted` +
        (mintedVersionId !== null ? `, version ${mintedVersionId}` : ", no version (zero pairs succeeded)"),
    );

    await importDb.end();
    await mainDb.end();
    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("DHIS2 import run failed:", e);
    const errorMessage = (e instanceof Error ? e.message : String(e)).slice(
      0,
      1000,
    );
    try {
      await mainDb`
        UPDATE dataset_hmis_import_runs
        SET status = 'error', ended_at = now(), progress = NULL,
          error = ${`${errorMessage} — pairs completed before the failure are preserved in the ledger.`}
        WHERE id = ${runId} AND status = 'running'
      `;
    } catch {
      // Ignore status update errors
    }
    try {
      await importDb.unsafe(
        `DROP TABLE IF EXISTS ${HMIS_DHIS2_RUN_SCOPE_TABLE_NAME}`,
      );
    } catch {
      // Ignore cleanup errors
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
  routes: Map<string, RawRoute>,
  predicate: (r: RawRoute) => boolean,
): number {
  let n = 0;
  for (const r of routes.values()) {
    if (predicate(r)) n++;
  }
  return n;
}

