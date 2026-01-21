import { pooledMap } from "@std/async/pool";
import { Sql } from "postgres";
import { getPgConnection } from "./db/postgres/connection_manager.ts";
import { getPresentationObjectDetail } from "./db/mod.ts";
import {
  getPresentationObjectItems,
  getResultsValueInfoForPresentationObject,
} from "./server_only_funcs_presentation_objects/mod.ts";
import {
  _PO_DETAIL_CACHE,
  _PO_ITEMS_CACHE,
  _METRIC_INFO_CACHE,
} from "./routes/caches/visualizations.ts";
import {
  _FETCH_CACHE_DATASET_HFA_ITEMS,
  _FETCH_CACHE_DATASET_HMIS_ITEMS,
} from "./routes/caches/dataset.ts";
import {
  type APIResponseWithData,
  getFetchConfigFromPresentationObjectConfig,
  type InstanceConfigFacilityColumns,
  type ResultsValueInfoForPresentationObject,
  throwIfErrWithData,
} from "lib";
import {
  getDatasetHfaItemsForDisplay,
  getDatasetHmisItemsForDisplay,
} from "./db/mod.ts";
import { getFacilityColumnsConfig } from "./db/instance/config.ts";

const CONCURRENT_LIMIT = 3; // Process 3 POs concurrently per project (projects run in series)
const BATCH_SIZE = 50; // Recreate connections every 50 POs to avoid stale connections

export async function warmAllCaches(): Promise<void> {
  const startTime = performance.now();
  console.log("Starting cache warming...");

  // Create fresh connection pool for dataset caches
  let mainDb = getPgConnection("main");
  try {
    await warmDatasetCaches(mainDb);
  } finally {
    await mainDb.end();
  }

  const poCount = await warmPresentationObjectCaches();

  const durationSeconds = ((performance.now() - startTime) / 1000).toFixed(1);
  console.log(
    `Cache warming complete: datasets, ${poCount} POs in ${durationSeconds}s`,
  );
}

async function warmPresentationObjectCaches(): Promise<number> {
  // Get list of projects with fresh connection
  let mainDb = getPgConnection("main");
  const projects = await mainDb<{ id: string; label: string }[]>`
    SELECT id, label FROM projects
  `;
  await mainDb.end();

  if (projects.length === 0) {
    console.log("No projects found - skipping PO cache warming");
    return 0;
  }

  let totalPOs = 0;

  for (const project of projects) {
    // Get POs for this project from project database (join through metrics to get module_id)
    let projectDb = getPgConnection(project.id);
    const allPresentationObjects = await projectDb<
      { id: string; label: string; module_id: string }[]
    >`
      SELECT po.id, po.label, m.module_id
      FROM presentation_objects po
      JOIN metrics m ON po.metric_id = m.id
    `;
    await projectDb.end();

    if (allPresentationObjects.length === 0) {
      continue;
    }

    // Process in batches to avoid stale connections
    for (let i = 0; i < allPresentationObjects.length; i += BATCH_SIZE) {
      const batch = allPresentationObjects.slice(i, i + BATCH_SIZE);
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const totalBatches = Math.ceil(
        allPresentationObjects.length / BATCH_SIZE,
      );

      console.log(
        `[${project.label}] Warming batch ${batchNum}/${totalBatches} (${batch.length} POs)`,
      );

      // Create fresh connection pools for this batch
      mainDb = getPgConnection("main");
      const projectDb = getPgConnection(project.id);

      try {
        const results = pooledMap(
          CONCURRENT_LIMIT,
          batch,
          async (po) => {
            try {
              // Get PO last_updated for cache versioning
              const poLastUpdated = (
                await projectDb<{ last_updated: string }[]>`
              SELECT last_updated FROM presentation_objects WHERE id = ${po.id}
            `
              ).at(0)?.last_updated;

              if (!poLastUpdated) {
                console.log(
                  `[${project.label}] Skipped PO (${po.label}): could not find last_updated`,
                );
                return {
                  success: false,
                  label: po.label,
                  error: "Could not find last_updated",
                };
              }

              // Cache PO Detail
              const existingDetail = await _PO_DETAIL_CACHE.get(
                {
                  projectId: project.id,
                  presentationObjectId: po.id,
                },
                { presentationObjectLastUpdated: poLastUpdated },
              );

              let poDetail;
              if (existingDetail && existingDetail.success === true) {
                poDetail = existingDetail.data;
              } else {
                const detailPromise = getPresentationObjectDetail(
                  project.id,
                  projectDb,
                  po.id,
                  mainDb,
                );

                // Store promise in cache BEFORE awaiting
                _PO_DETAIL_CACHE.setPromise(
                  detailPromise,
                  {
                    projectId: project.id,
                    presentationObjectId: po.id,
                  },
                  { presentationObjectLastUpdated: poLastUpdated },
                );

                const resDetail = await detailPromise;
                throwIfErrWithData(resDetail);
                poDetail = resDetail.data;
              }

              const moduleLastRun = (
                await projectDb<{ last_run: string | null }[]>`
            SELECT last_run FROM modules WHERE id = ${po.module_id}
          `
              ).at(0)?.last_run;

              if (!moduleLastRun) {
                console.log(
                  `[${project.label}] Skipped PO (${po.label}): module has not run yet`,
                );
                return {
                  success: false,
                  label: po.label,
                  error: "Module has not run yet",
                };
              }

              /////////////////////////
              //                     //
              //    Variable info    //
              //                     //
              /////////////////////////

              // Warm variable info (unfiltered - shows all possible values)
              const existingResultsValueInfo = await _METRIC_INFO_CACHE
                .get(
                  {
                    projectId: project.id,
                    metricId: poDetail.resultsValue.id,
                  },
                  { moduleLastRun },
                );

              if (
                !existingResultsValueInfo ||
                existingResultsValueInfo.success === false
              ) {
                const resultsValueInfoPromise =
                  getResultsValueInfoForPresentationObject(
                    mainDb,
                    projectDb,
                    project.id,
                    poDetail.resultsValue.id,
                    moduleLastRun,
                  );

                _METRIC_INFO_CACHE.setPromise(
                  resultsValueInfoPromise,
                  {
                    projectId: project.id,
                    metricId: poDetail.resultsValue.id,
                  },
                  { moduleLastRun },
                );

                const resResultsValueInfo = await resultsValueInfoPromise;
                throwIfErrWithData(resResultsValueInfo);
                console.log(
                  `[${project.label}] Warmed Results Value Info for RV: ${poDetail.resultsValue.id}, moduleLastRun: ${moduleLastRun}`,
                );
              }

              /////////////////
              //             //
              //    Items    //
              //             //
              /////////////////

              const resFetchConfig = getFetchConfigFromPresentationObjectConfig(
                poDetail.resultsValue,
                poDetail.config,
              );
              throwIfErrWithData(resFetchConfig);
              const fetchConfig = resFetchConfig.data;

              const existingItems = await _PO_ITEMS_CACHE.get(
                {
                  projectId: project.id,
                  resultsObjectId: poDetail.resultsValue.resultsObjectId,
                  fetchConfig,
                },
                { moduleLastRun },
              );

              if (!existingItems) {
                const itemsPromise = getPresentationObjectItems(
                  mainDb,
                  project.id,
                  projectDb,
                  poDetail.resultsValue.resultsObjectId,
                  fetchConfig,
                  poDetail.resultsValue.periodOptions.at(0),
                  moduleLastRun,
                );

                // Store promise in cache BEFORE awaiting
                _PO_ITEMS_CACHE.setPromise(
                  itemsPromise,
                  {
                    projectId: project.id,
                    resultsObjectId: poDetail.resultsValue.resultsObjectId,
                    fetchConfig,
                  },
                  { moduleLastRun },
                );

                const resItems = await itemsPromise;
                throwIfErrWithData(resItems);

                // Log based on status
                if (resItems.data.status === "too_many_items") {
                  console.log(
                    `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - TOO MANY ITEMS`,
                  );
                } else if (resItems.data.status === "no_data_available") {
                  console.log(
                    `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - NO DATA`,
                  );
                } else {
                  console.log(
                    `[${project.label}] Warmed cache for PO: ${po.label} (RV: ${poDetail.resultsValue.id}) - ${resItems.data.items.length} items`,
                  );
                }
              }

              return { success: true, label: po.label };
            } catch (err) {
              const errMsg = err instanceof Error ? err.message : String(err);
              console.log(
                `[${project.label}] Skipped PO (${po.label}): ${errMsg}`,
              );
              return { success: false, label: po.label, error: errMsg };
            }
          },
        );

        for await (const result of results) {
          if (result.success) {
            totalPOs++;
          }
        }
      } finally {
        // Always close both connection pools after batch
        await Promise.all([mainDb.end(), projectDb.end()]);
      }
    }
  }

  return totalPOs;
}

async function warmDatasetCaches(mainDb: Sql): Promise<void> {
  console.log("Warming dataset caches...");

  const facilityConfigResult = await getFacilityColumnsConfig(mainDb);
  const facilityColumns: InstanceConfigFacilityColumns = facilityConfigResult
      .success
    ? facilityConfigResult.data
    : {
      includeNames: false,
      includeTypes: false,
      includeOwnership: false,
      includeCustom1: false,
      includeCustom2: false,
      includeCustom3: false,
      includeCustom4: false,
      includeCustom5: false,
    };

  const hmisVersion = (
    await mainDb<
      { id: number }[]
    >`SELECT id FROM dataset_hmis_versions ORDER BY id DESC LIMIT 1`
  ).at(0);

  if (hmisVersion) {
    const indicatorMappingsVersion = (
      await mainDb<
        { updated_at: string }[]
      >`SELECT updated_at FROM indicator_mappings ORDER BY updated_at DESC LIMIT 1`
    ).at(0)?.updated_at ?? new Date().toISOString();

    for (const indicatorType of ["raw", "common"] as const) {
      const hmisPromise = getDatasetHmisItemsForDisplay(
        mainDb,
        hmisVersion.id,
        indicatorMappingsVersion,
        indicatorType,
        facilityColumns,
      );

      _FETCH_CACHE_DATASET_HMIS_ITEMS.setPromise(
        hmisPromise,
        {
          rawOrCommonIndicators: indicatorType,
          facilityColumns,
        },
        {
          versionId: hmisVersion.id,
          indicatorMappingsVersion,
        },
      );

      const resHmis = await hmisPromise;
      if (resHmis.success) {
        console.log(
          `Warmed HMIS dataset cache (${indicatorType} indicators)`,
        );
      }
    }
  }

  const hfaVersion = (
    await mainDb<
      { id: number }[]
    >`SELECT id FROM dataset_hfa_versions ORDER BY id DESC LIMIT 1`
  ).at(0);

  if (hfaVersion) {
    const hfaPromise = getDatasetHfaItemsForDisplay(mainDb, hfaVersion.id);

    _FETCH_CACHE_DATASET_HFA_ITEMS.setPromise(
      hfaPromise,
      {},
      {
        versionId: hfaVersion.id,
      },
    );

    const resHfa = await hfaPromise;
    if (resHfa.success) {
      console.log("Warmed HFA dataset cache");
    }
  }
}
