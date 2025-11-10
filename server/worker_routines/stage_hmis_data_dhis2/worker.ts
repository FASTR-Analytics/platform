// ============================================================================
// SECTION 1: WORKER INITIALIZATION & MESSAGE HANDLING
// ============================================================================

import { pooledMap } from "@std/async/pool";
import { Sql } from "postgres";
import { UPLOADED_HMIS_DATA_STAGING_TABLE_NAME } from "../../exposed_env_vars.ts";
import {
  createBulkImportConnection,
  createWorkerReadConnection,
  type DBDatasetHmisUploadAttempt,
} from "../../db/mod.ts";
import {
  Dhis2Credentials,
  parseJsonOrThrow,
  type DatasetDhis2StagingResult,
  type DatasetUploadAttemptStatus,
  type Dhis2SelectionParams,
  type PeriodIndicatorRawStat,
} from "lib";
import { getAnalyticsFromDHIS2 } from "../../dhis2/goal3_analytics/mod.ts";

(self as unknown as Worker).onmessage = (e) => {
  run(e.data).catch((error) => {
    console.error("DHIS2 staging worker error:", error);
    self.reportError(error);
    self.close();
  });
};

(self as unknown as Worker).postMessage("READY");

// ============================================================================
// SECTION 2: TYPE DEFINITIONS
// ============================================================================

type WorkItem = {
  rawIndicatorId: string;
  period: string;
  periodId: number;
};

type WorkItemProgress = {
  indicatorId: string;
  periodId: number;
  facilityBatchesCompleted: number;
  totalFacilityBatches: number;
  startTime: string;
};

type CompletedWorkItem = {
  indicatorId: string;
  periodId: number;
  success: boolean;
  rowsStaged: number;
  facilityBatchesProcessed: number;
  completedAt: string;
  durationMs: number;
};

// ============================================================================
// SECTION 3: MAIN ORCHESTRATION
// ============================================================================

const _SKIP_META = true;
const FACILITY_BATCH_SIZE = 100;
let alreadyRunning = false;

async function run(std: {
  rawDUA: DBDatasetHmisUploadAttempt;
  failFastMode?: "fail-fast" | "continue-on-error";
}) {
  if (alreadyRunning) {
    self.close();
    return;
  }
  alreadyRunning = true;

  const { rawDUA, failFastMode = "continue-on-error" } = std;
  const failFast = failFastMode === "fail-fast";
  const stagingTableName = UPLOADED_HMIS_DATA_STAGING_TABLE_NAME;
  const importDb = createBulkImportConnection("main");
  const mainDb = createWorkerReadConnection("main");

  try {
    if (!rawDUA.step_1_result || !rawDUA.step_2_result) {
      throw new Error("Not yet ready for this step");
    }

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 1: PARSE CONFIGURATION & VALIDATE PREREQUISITES                   │
    // └─────────────────────────────────────────────────────────────────────────┘

    const dhis2Credentials = parseJsonOrThrow<Dhis2Credentials>(
      rawDUA.step_1_result
    );

    const selection = parseJsonOrThrow<Dhis2SelectionParams>(
      rawDUA.step_2_result
    );

    const credentials = {
      url: dhis2Credentials.url,
      username: dhis2Credentials.username,
      password: dhis2Credentials.password,
    };

    console.log(
      "DEBUG: dhis2Credentials structure:",
      Object.keys(dhis2Credentials)
    );
    console.log("DEBUG: credentials.url:", credentials.url);
    console.log(
      "DEBUG: credentials.username:",
      credentials.username ? "[set]" : "[not set]"
    );
    console.log(
      "DEBUG: credentials.password:",
      credentials.password ? "[set]" : "[not set]"
    );

    const dateImported = new Date().toISOString();
    await updateImportProgress(mainDb, 5);

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 2: CREATE STAGING TABLE                                           │
    // └─────────────────────────────────────────────────────────────────────────┘

    await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);

    await importDb.unsafe(`
      CREATE UNLOGGED TABLE ${stagingTableName} (
        facility_id TEXT NOT NULL,
        indicator_raw_id TEXT NOT NULL,
        period_id INTEGER NOT NULL,
        count INTEGER NOT NULL
      )
    `);

    await updateImportProgress(mainDb, 10);

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 3: PREPARE WORK ITEMS & FETCH FACILITIES                          │
    // └─────────────────────────────────────────────────────────────────────────┘

    const facilities = await mainDb<{ facility_id: string }[]>`
      SELECT facility_id FROM facilities
    `;
    console.log("DEBUG: Raw facilities from DB:", facilities.slice(0, 5));
    console.log("DEBUG: Total facilities from DB:", facilities.length);

    const nullFacilities = facilities.filter((f) => !f.facility_id);
    if (nullFacilities.length > 0) {
      console.log(
        "WARNING: Found facilities with null/undefined IDs:",
        nullFacilities
      );
    }

    const facilityIds = facilities.map((f) => f.facility_id).filter(Boolean);
    console.log(
      "DEBUG: Facility IDs after filtering:",
      facilityIds.slice(0, 5)
    );
    console.log(
      "DEBUG: Total facility IDs after filtering:",
      facilityIds.length
    );

    const periods: string[] = [];
    for (let p = selection.startPeriod; p <= selection.endPeriod; p++) {
      const year = Math.floor(p / 100);
      const month = p % 100;
      if (month >= 1 && month <= 12) {
        periods.push(`${year}${month.toString().padStart(2, "0")}`);
      }
    }

    const workItems: WorkItem[] = [];
    for (const rawIndicatorId of selection.rawIndicatorIds) {
      for (const period of periods) {
        const year = parseInt(period.substring(0, 4));
        const month = parseInt(period.substring(4, 6));
        const periodId = year * 100 + month;

        workItems.push({
          rawIndicatorId,
          period,
          periodId,
        });
      }
    }

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 4: CONCURRENT DATA FETCHING FROM DHIS2                            │
    // └─────────────────────────────────────────────────────────────────────────┘

    // Progress tracking and statistics collection variables
    const totalCombos = workItems.length;
    const failedFetches: Array<{
      indicatorRawId: string;
      periodId: number;
      error: string;
    }> = [];

    let totalRowsStaged = 0;
    const periodIndicatorStatsMap = new Map<string, PeriodIndicatorRawStat>();
    const allMissingOrgUnits = new Set<string>();

    const activeWorkItems = new Map<string, WorkItemProgress>();
    const completedWorkItemHistory: CompletedWorkItem[] = [];
    let completedWorkItems = 0;
    let failedWorkItems = 0;

    // Limit concurrent requests to avoid overwhelming DHIS2 server
    const CONCURRENT_REQUESTS = 5;

    const updateGranularProgress = async () => {
      let partialProgress = 0;
      for (const workItem of activeWorkItems.values()) {
        const itemProgress =
          workItem.facilityBatchesCompleted / workItem.totalFacilityBatches;
        partialProgress += itemProgress;
      }

      const totalProgress = completedWorkItems + partialProgress;
      const progress = 10 + (totalProgress / totalCombos) * 80;

      const status: DatasetUploadAttemptStatus = {
        status: "staging_dhis2",
        progress: Math.round(progress),
        totalWorkItems: totalCombos,
        completedWorkItems,
        failedWorkItems,
        activeWorkItems: Array.from(activeWorkItems.values()),
        completedWorkItemHistory,
      };

      await mainDb`
        UPDATE dataset_hmis_upload_attempts
        SET
          status = ${JSON.stringify(status)},
          status_type = 'staging'
      `;
    };

    const results = pooledMap(CONCURRENT_REQUESTS, workItems, async (item) => {
      const workItemKey = `${item.rawIndicatorId}-${item.periodId}`;
      const totalFacilityBatches = Math.ceil(
        facilityIds.length / FACILITY_BATCH_SIZE
      );
      const startTime = new Date().toISOString();
      const startMs = Date.now();

      activeWorkItems.set(workItemKey, {
        indicatorId: item.rawIndicatorId,
        periodId: item.periodId,
        facilityBatchesCompleted: 0,
        totalFacilityBatches,
        startTime,
      });

      try {
        await updateGranularProgress();
      } catch (e) {
        console.error("Failed to update initial progress:", e);
      }

      const onFacilityBatchComplete = async (batchIndex: number) => {
        const progress = activeWorkItems.get(workItemKey);
        if (progress) {
          progress.facilityBatchesCompleted = batchIndex + 1;
          try {
            await updateGranularProgress();
          } catch (e) {
            console.error("Failed to update batch progress:", e);
          }
        }
      };

      const result = await fetchIndicatorPeriod(
        item,
        facilityIds,
        onFacilityBatchComplete,
        credentials,
        _SKIP_META
      );

      // Check for failure and abort if failFast enabled
      if (!result.success && failFast) {
        throw new Error(
          `Aborting: Work item failed with fail-fast mode enabled.\n` +
            `Failed item: ${item.rawIndicatorId} for period ${item.periodId}\n` +
            `Error: ${result.error?.error || "Unknown error"}`
        );
      }

      activeWorkItems.delete(workItemKey);

      const durationMs = Date.now() - startMs;
      const completedAt = new Date().toISOString();

      if (result.success) {
        completedWorkItems++;
        if (completedWorkItemHistory.length < 20) {
          completedWorkItemHistory.push({
            indicatorId: item.rawIndicatorId,
            periodId: item.periodId,
            success: true,
            rowsStaged: result.rowCount || 0,
            facilityBatchesProcessed: totalFacilityBatches,
            completedAt,
            durationMs,
          });
        }
      } else {
        failedWorkItems++;
        if (completedWorkItemHistory.length < 20) {
          completedWorkItemHistory.push({
            indicatorId: item.rawIndicatorId,
            periodId: item.periodId,
            success: false,
            rowsStaged: 0,
            facilityBatchesProcessed: 0,
            completedAt,
            durationMs,
          });
        }
      }

      await updateGranularProgress();

      return result;
    });

    for await (const result of results) {
      if (result.success) {
        if (result.valueRows && result.valueRows.length > 0) {
          await importDb.unsafe(
            `INSERT INTO ${stagingTableName} (facility_id, indicator_raw_id, period_id, count) VALUES ${result.valueRows.join(
              ","
            )}`
          );
          totalRowsStaged += result.rowCount || 0;
        }

        if (!_SKIP_META && result.missingOUs) {
          for (const ouId of result.missingOUs) {
            allMissingOrgUnits.add(ouId);
          }
        }

        if (result.stats) {
          for (const [statsKey, stat] of result.stats) {
            if (!periodIndicatorStatsMap.has(statsKey)) {
              const [periodIdStr, rawIndicatorId] = statsKey.split("-");
              periodIndicatorStatsMap.set(statsKey, {
                periodId: parseInt(periodIdStr),
                indicatorRawId: rawIndicatorId,
                nRecords: 0,
                totalCount: 0,
              });
            }
            const mainStat = periodIndicatorStatsMap.get(statsKey)!;
            mainStat.nRecords += stat.nRecords;
            mainStat.totalCount += stat.totalCount;
          }
        }
      } else if (result.error) {
        failedFetches.push(result.error);
        console.error(
          `Failed to fetch ${result.error.indicatorRawId} for period ${result.error.periodId}:`,
          result.error.error
        );
      }
    }

    await updateImportProgress(mainDb, 90);

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 5: CREATE INDEXES & FINALIZE STAGING                              │
    // └─────────────────────────────────────────────────────────────────────────┘

    if (totalRowsStaged > 0) {
      await importDb.unsafe(
        `CREATE INDEX idx_staging_dhis2 ON ${stagingTableName} (facility_id, indicator_raw_id, period_id)`
      );
    }

    const periodIndicatorStats = Array.from(periodIndicatorStatsMap.values());

    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ PHASE 6: SAVE RESULTS & CLEANUP                                         │
    // └─────────────────────────────────────────────────────────────────────────┘

    const stagingResult: DatasetDhis2StagingResult = {
      sourceType: "dhis2",
      dateImported,
      totalIndicatorPeriodCombos: totalCombos,
      successfulFetches: totalCombos - failedFetches.length,
      failedFetches: failedFetches.slice(0, 100),
      periodIndicatorStats,
      finalStagingRowCount: totalRowsStaged,
      missingOrgUnits:
        allMissingOrgUnits.size > 0
          ? Array.from(allMissingOrgUnits)
          : undefined,
      workItemHistory: completedWorkItemHistory,
    };

    await mainDb`
      UPDATE dataset_hmis_upload_attempts
      SET
        step = 4,
        step_3_result = ${JSON.stringify(stagingResult)},
        status = ${JSON.stringify({ status: "staged" })},
        status_type = 'staged'
    `;

    console.log(`DHIS2 staging completed successfully for upload attempt`);
    console.log(
      `Staged ${totalRowsStaged} rows from ${totalCombos} indicator-period combinations`
    );
    console.log(`Mode: ${failFastMode}`);
    if (failedFetches.length > 0) {
      console.log(`${failedFetches.length} fetch operations failed`);
    }
    if (!_SKIP_META && allMissingOrgUnits.size > 0) {
      console.warn(
        `\n⚠️  Found ${allMissingOrgUnits.size} organizational units that don't exist in DHIS2:`
      );
      const missingArray = Array.from(allMissingOrgUnits);
      console.warn(
        missingArray.slice(0, 20).join(", "),
        missingArray.length > 20
          ? `... and ${missingArray.length - 20} more`
          : ""
      );
    }

    await importDb.end();
    await mainDb.end();

    self.postMessage("COMPLETED");
  } catch (e) {
    console.error("Failed on DHIS2 staging:", e);

    if (e instanceof AggregateError) {
      console.error("Detailed errors from concurrent processing:");
      for (const error of e.errors) {
        console.error("  -", error);
      }
    }

    try {
      let errorMessage = "DHIS2 staging failed";
      if (e instanceof AggregateError && e.errors.length > 0) {
        errorMessage =
          e.errors[0] instanceof Error
            ? e.errors[0].message
            : String(e.errors[0]);
      } else if (e instanceof Error) {
        errorMessage = e.message;
      }

      await mainDb`
        UPDATE dataset_hmis_upload_attempts
        SET
          status = ${JSON.stringify({
            status: "error",
            err: errorMessage,
          })},
          status_type = 'error'
      `;
    } catch {
      // Ignore status update errors
    }

    try {
      await importDb.unsafe(`DROP TABLE IF EXISTS ${stagingTableName}`);
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
// SECTION 4: HELPER FUNCTIONS
// ============================================================================

async function updateImportProgress(
  mainDb: Sql,
  progress: number
): Promise<void> {
  const status: DatasetUploadAttemptStatus = {
    status: "staging",
    progress: Math.round(progress),
  };
  await mainDb`
    UPDATE dataset_hmis_upload_attempts
    SET
      status = ${JSON.stringify(status)},
      status_type = 'staging'
  `;
}

async function fetchIndicatorPeriod(
  item: WorkItem,
  facilityIds: string[],
  onFacilityBatchComplete?: (batchIndex: number) => Promise<void>,
  credentials?: Dhis2Credentials,
  skipMeta?: boolean
): Promise<{
  success: boolean;
  valueRows?: string[];
  rowCount?: number;
  stats?: Map<string, { nRecords: number; totalCount: number }>;
  missingOUs?: string[];
  error?: {
    indicatorRawId: string;
    periodId: number;
    error: string;
  };
}> {
  const { rawIndicatorId, period, periodId } = item;

  try {
    const valueRows: string[] = [];
    let localRowCount = 0;
    const localStats = new Map<
      string,
      { nRecords: number; totalCount: number }
    >();
    const allMissingOUs: string[] = [];

    // Value analysis tracking
    const valueAnalysis = {
      totalValues: 0,
      decimalValues: 0,
      truncatedValues: 0,
      negativeValues: 0,
      totalLoss: 0,
      totalSum: 0,
      examples: [] as Array<{
        rawValue: string;
        parsedValue: number;
        floatValue: number;
        difference: number;
      }>,
    };

    // URL length tracking and data completeness verification
    const urlAnalysis = {
      totalBatches: 0,
      longUrls: 0,
      maxUrlLength: 0,
      avgUrlLength: 0,
      totalUrlLength: 0,
      facilitiesRequested: 0,
      facilitiesWithData: 0,
      suspiciousBatches: [] as Array<{
        batchSize: number;
        urlLength: number;
        facilitiesRequested: number;
        facilitiesWithData: number;
        dataLossPercentage: number;
      }>,
    };

    // Batch facilities to avoid DHIS2 URL length limits
    let batchIndex = 0;

    for (let i = 0; i < facilityIds.length; i += FACILITY_BATCH_SIZE) {
      const facilityBatch = facilityIds.slice(i, i + FACILITY_BATCH_SIZE);

      if (!credentials) {
        throw new Error("DHIS2 credentials are required for data fetching");
      }

      // Track URL length and data completeness for this batch
      urlAnalysis.totalBatches++;
      urlAnalysis.facilitiesRequested += facilityBatch.length;

      const searchParams = new URLSearchParams();
      searchParams.set("dimension", `dx:${rawIndicatorId}`);
      searchParams.set("dimension", `pe:${period}`);
      searchParams.set("dimension", `ou:${facilityBatch.join(";")}`);
      if (skipMeta) {
        searchParams.set("skipMeta", "true");
      }
      const testUrl = `/api/analytics.json?${searchParams.toString()}`;
      const urlLength = testUrl.length;

      urlAnalysis.totalUrlLength += urlLength;
      urlAnalysis.maxUrlLength = Math.max(urlAnalysis.maxUrlLength, urlLength);

      if (urlLength > 2048) {
        urlAnalysis.longUrls++;
        // Error immediately to prevent potential data loss
        throw new Error(
          `URL length ${urlLength} exceeds safe limit of 2048 characters for batch with ${facilityBatch.length} facilities. ` +
          `This may cause incomplete data retrieval from DHIS2. ` +
          `Reduce FACILITY_BATCH_SIZE from ${FACILITY_BATCH_SIZE} to a smaller value (try 30-40).`
        );
      }

      const response = await getAnalyticsFromDHIS2<string[]>(
        {
          dataElements: [rawIndicatorId],
          orgUnits: facilityBatch,
          periods: [period],
          skipMeta: skipMeta,
        },
        {
          retryOptions: {
            maxAttempts: 10,
            initialDelayMs: 1000,
            maxDelayMs: 60000,
          },
          dhis2Credentials: credentials,
        }
      );

      if (!skipMeta) {
        if (response.rows.length === 0) {
          console.log(
            `No data returned for ${rawIndicatorId}, period ${period}, batch with ${facilityBatch.length} OUs`
          );

          if (!response.metaData) {
            console.warn(
              `  ⚠️ No metaData in response - cannot determine if OUs exist`
            );
          } else if (!response.metaData.items) {
            console.warn(
              `  ⚠️ No items in metaData - cannot determine if OUs exist`
            );
          } else {
            const ouIdsInMetadata = Object.keys(response.metaData.items).filter(
              (key) => facilityBatch.includes(key)
            );
            console.log(
              `  📊 Found ${ouIdsInMetadata.length}/${facilityBatch.length} OUs in metadata`
            );

            if (ouIdsInMetadata.length < facilityBatch.length) {
              const missingInThisBatch = facilityBatch.filter(
                (ou) => !response.metaData.items[ou]
              );
              console.warn(`  ❌ Missing OUs:`, missingInThisBatch.slice(0, 5));
            }
          }
        }

        const missingOUs: string[] = [];
        if (response.metaData && response.metaData.items) {
          for (const ouId of facilityBatch) {
            if (!response.metaData.items[ouId]) {
              missingOUs.push(ouId);
            }
          }
        }

        if (missingOUs.length > 0) {
          console.warn(
            `Missing OUs in DHIS2 for ${rawIndicatorId}, period ${period}:`,
            missingOUs.slice(0, 10),
            missingOUs.length > 10
              ? `... and ${missingOUs.length - 10} more`
              : ""
          );
          allMissingOUs.push(...missingOUs);
        }
      }

      // Track which facilities returned data for this batch
      const facilitiesWithDataInBatch = new Set<string>();

      if (response.rows && response.rows.length > 0) {
        const orgUnitIndex = response.headers.findIndex(
          (h) => h.name === "ou" || h.name === "Organisation unit"
        );
        const valueIndex = response.headers.findIndex(
          (h) => h.name === "value" || h.name === "Value"
        );

        if (orgUnitIndex >= 0 && valueIndex >= 0) {
          for (const row of response.rows) {
            const facilityId = row[orgUnitIndex];
            const rawValue = row[valueIndex];
            const value = parseInt(rawValue);
            const floatValue = parseFloat(rawValue);

            // Analyze value differences
            valueAnalysis.totalValues++;
            if (rawValue.includes(".")) {
              valueAnalysis.decimalValues++;
            }
            if (value !== floatValue) {
              valueAnalysis.truncatedValues++;
              const difference = floatValue - value;
              valueAnalysis.totalLoss += difference;

              // Store examples for logging (limit to 10)
              if (valueAnalysis.examples.length < 10) {
                valueAnalysis.examples.push({
                  rawValue,
                  parsedValue: value,
                  floatValue,
                  difference,
                });
              }
            }
            if (floatValue < 0) {
              valueAnalysis.negativeValues++;
            }

            if (!facilityId) {
              console.log(
                "ERROR: facilityId is undefined/null in DHIS2 response row:",
                row
              );
              console.log("  - orgUnitIndex:", orgUnitIndex);
              console.log("  - headers:", response.headers);
              console.log("  - rawIndicatorId:", rawIndicatorId);
              console.log("  - period:", period);
            }

            // Track facility data regardless of whether it passes filters
            if (facilityId) {
              facilitiesWithDataInBatch.add(facilityId);
            }

            if (!isNaN(value) && value >= 0 && facilityId) {
              valueRows.push(
                `('${facilityId.replace(/'/g, "''")}','${rawIndicatorId.replace(
                  /'/g,
                  "''"
                )}',${periodId},${value})`
              );
              localRowCount++;

              // Track total sum for logging
              valueAnalysis.totalSum += value;

              const statsKey = `${periodId}-${rawIndicatorId}`;
              if (!localStats.has(statsKey)) {
                localStats.set(statsKey, { nRecords: 0, totalCount: 0 });
              }
              const stat = localStats.get(statsKey)!;
              stat.nRecords++;
              stat.totalCount += value;
            }
          }
        }
      }

      // Analyze data completeness for this batch
      const facilitiesWithData = facilitiesWithDataInBatch.size;
      urlAnalysis.facilitiesWithData += facilitiesWithData;

      // Check for suspicious data loss (considering that not all facilities may have data)
      // We're looking for cases where URL length correlates with unexpectedly low facility coverage
      const dataLossPercentage =
        facilitiesWithData > 0
          ? ((facilityBatch.length - facilitiesWithData) /
              facilityBatch.length) *
            100
          : 100;

      // Flag as suspicious if URL is long AND we have significant data loss
      if (urlLength > 2048 && dataLossPercentage > 50) {
        urlAnalysis.suspiciousBatches.push({
          batchSize: facilityBatch.length,
          urlLength,
          facilitiesRequested: facilityBatch.length,
          facilitiesWithData,
          dataLossPercentage,
        });
      }

      if (onFacilityBatchComplete) {
        await onFacilityBatchComplete(batchIndex);
      }
      batchIndex++;
    }

    // Calculate URL analysis averages
    if (urlAnalysis.totalBatches > 0) {
      urlAnalysis.avgUrlLength = Math.round(
        urlAnalysis.totalUrlLength / urlAnalysis.totalBatches
      );
    }

    // Log URL analysis summary
    console.log(
      `\n🔗 URL LENGTH ANALYSIS for ${rawIndicatorId}, period ${period}:`
    );
    console.log(`  Total batches: ${urlAnalysis.totalBatches}`);
    console.log(`  Max URL length: ${urlAnalysis.maxUrlLength} chars`);
    console.log(`  Avg URL length: ${urlAnalysis.avgUrlLength} chars`);
    console.log(
      `  URLs > 2048 chars: ${urlAnalysis.longUrls}/${urlAnalysis.totalBatches}`
    );

    if (urlAnalysis.longUrls > 0) {
      console.log(`  🚨 EXCESSIVE URL LENGTH DETECTED!`);
      console.log(
        `  ⚠️  ${urlAnalysis.longUrls} out of ${urlAnalysis.totalBatches} batches exceed 2048 characters`
      );
      console.log(`  🔍 This may cause silent data loss or request failures`);

      if (urlAnalysis.suspiciousBatches.length > 0) {
        console.log(`  📋 Examples of problematic batches:`);
        for (const example of urlAnalysis.suspiciousBatches) {
          console.log(
            `    Batch with ${example.facilitiesRequested} facilities → ${
              example.urlLength
            } chars (${example.dataLossPercentage.toFixed(1)}% data loss)`
          );
        }
      }
      console.log(
        `  💡 Consider reducing FACILITY_BATCH_SIZE from 140 to a smaller value`
      );
    } else {
      console.log(`  ✅ All URLs within safe length limits`);
    }

    // Log work item summary - ALWAYS log this
    console.log(`\n📊 WORK ITEM SUMMARY for ${rawIndicatorId}, period ${period}:`);
    console.log(`  Records processed: ${localRowCount}`);
    console.log(`  💰 TOTAL SUM: ${valueAnalysis.totalSum}`);

    // Log detailed value analysis if we have data
    if (valueAnalysis.totalValues > 0) {
      console.log(`  Total values processed: ${valueAnalysis.totalValues}`);
      console.log(`  Values with decimals: ${valueAnalysis.decimalValues}`);
      console.log(`  Values truncated: ${valueAnalysis.truncatedValues}`);
      console.log(`  Negative values: ${valueAnalysis.negativeValues}`);
      console.log(
        `  Total numeric loss: ${valueAnalysis.totalLoss.toFixed(2)}`
      );

      if (valueAnalysis.truncatedValues > 0) {
        console.log(
          `  ⚠️  TRUNCATION DETECTED: ${valueAnalysis.truncatedValues}/${valueAnalysis.totalValues} values truncated`
        );
        console.log(
          `  💰 TOTAL VALUE LOST: ${valueAnalysis.totalLoss.toFixed(2)}`
        );

        if (valueAnalysis.examples.length > 0) {
          console.log(`  📝 Examples of truncation:`);
          for (const example of valueAnalysis.examples) {
            console.log(
              `    "${example.rawValue}" → ${
                example.parsedValue
              } (lost: ${example.difference.toFixed(2)})`
            );
          }
        }
      } else {
        console.log(`  ✅ No truncation detected - all values are integers`);
      }
    } else {
      console.log(`  ℹ️  No values to analyze (no data returned for this indicator/period)`);
    }

    return {
      success: true,
      valueRows,
      rowCount: localRowCount,
      stats: localStats,
      missingOUs: allMissingOUs.length > 0 ? allMissingOUs : undefined,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const totalBatches = Math.ceil(facilityIds.length / FACILITY_BATCH_SIZE);

    console.error(
      `\n!!! ERROR fetching ${rawIndicatorId} for period ${period} !!!`
    );
    console.error(`Error details: ${errorMessage}`);
    console.error(`Request context:`);
    console.error(`  - Indicator: ${rawIndicatorId}`);
    console.error(`  - Period: ${period} (periodId: ${periodId})`);
    console.error(`  - Total facilities: ${facilityIds.length}`);
    console.error(`  - Total batches: ${totalBatches}`);
    console.error(`Full error:`, error);

    return {
      success: false,
      error: {
        indicatorRawId: rawIndicatorId,
        periodId,
        error: errorMessage,
      },
    };
  }
}
