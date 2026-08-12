import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  cancelDatasetHfaImportRun,
  cancelDatasetHmisImportRun,
  computeHfaCacheHash,
  createDatasetHmisScheduledImport,
  deleteDatasetHfaData,
  deleteAllDatasetHmisData,
  deleteDatasetHmisScheduledImport,
  enqueueDatasetHmisCsvImportRun,
  enqueueDatasetHmisImportRun,
  getDatasetHfaDetail,
  getDatasetHfaImportRunSummaries,
  getDatasetHfaItemsForDisplay,
  getDatasetHmisDetail,
  getDatasetHmisImportLedgerItems,
  getDatasetHmisImportRunDetail,
  getDatasetHmisImportRunSummaries,
  getDatasetHmisItemsForDisplay,
  getDatasetHmisScheduledImports,
  getStoredDhis2CredentialsInfo,
  getVersionsForDatasetHmis,
  isDhis2CredentialsEncryptionKeyConfigured,
  launchDatasetHfaCsvImportRun,
  launchDatasetHmisCsvImportRun,
  launchDatasetHmisDhis2ImportRun,
  resolveDatasetHfaReview,
  resolveDatasetHmisCsvReview,
  updateDatasetHmisScheduledImport,
  getInstanceDatasetsSummary,
} from "../../db/mod.ts";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { getXlsxSheetNamesRaw } from "../../server_only_funcs_csvs/read_xlsx_raw.ts";
import { scanHfaDuplicates } from "../../server_only_funcs_csvs/scan_hfa_rows.ts";
import { resolveAssetFileOrThrow } from "../../db/instance/assets.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { notifyInstanceDatasetsUpdated } from "../../task_management/notify_instance_updated.ts";
import { _FETCH_CACHE_DATASET_HFA_ITEMS } from "../caches/dataset.ts";
import { defineRoute } from "../route-helpers.ts";
import { validateDhis2Connection } from "../../dhis2/mod.ts";
import { t3 } from "lib";

export const routesDatasets = new Hono();

//////////////////////////
//                      //
//    Dataset detail    //
//                      //
//////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHmisDetail",
  requireGlobalPermission("can_view_data"),
  async (c) => {
    const res = await getDatasetHmisDetail(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHmisVersions",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisVersions"),
  async (c) => {
    const res = await getVersionsForDatasetHmis(c.var.mainDb);
    return c.json(res);
  },
);

/////////////////////////
//                     //
//    Dataset items    //
//                     //
/////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHmisImportLedger",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisImportLedger"),
  async (c) => {
    const res = await getDatasetHmisImportLedgerItems(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHmisDisplayInfo",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisDisplayInfo"),
  async (c, { body }) => {
    // Computed live on every call. Since vizItems moved to the import ledger
    // (~1.4k rows, not a dataset_hmis scan) the read costs a few ms, so the
    // Valkey layer that used to shield it (ds_hmis_v2) was deleted along with
    // its liabilities: the mid-run cache-bypass dance and the prefix-bump
    // obligation on every payload-shape change. Client-side caching remains —
    // the T2 IndexedDB cache keys on versionId + indicatorMappingsVersion,
    // which only flip at run end (running-run versions are hidden from
    // readers — see getVersionsForDatasetHmis), and the client bypasses it
    // while a run is active, so mid-run reads stay live end to end.
    const res = await getDatasetHmisItemsForDisplay(
      c.var.mainDb,
      body.versionId,
      body.indicatorMappingsVersion,
      body.rawOrCommonIndicators,
      body.structureSchema,
    );
    return c.json(res);
  },
);

/////////////////////////////////
//                             //
//    DHIS2 import runs        //
//                             //
/////////////////////////////////

defineRoute(
  routesDatasets,
  "launchDatasetHmisDhis2Run",
  requireGlobalPermission("can_configure_data"),
  log("launchDatasetHmisDhis2Run"),
  async (c, { body }) => {
    // Absent credentials = use the stored instance credentials (Phase 4 C3).
    // Stored launches skip pre-validation — validating would decrypt the
    // password in the host, and decryption is worker-only; bad stored
    // credentials fail the run loudly within seconds.
    let dhis2Url: string;
    if (body.credentials) {
      const validation = await validateDhis2Connection(body.credentials);
      if (!validation.valid) {
        return c.json({ success: false, err: t3(validation.message) });
      }
      dhis2Url = body.credentials.url;
    } else {
      const stored = await getStoredDhis2CredentialsInfo(c.var.mainDb);
      if (!stored) {
        return c.json({
          success: false,
          err: "No stored DHIS2 credentials — enter credentials or save them first.",
        });
      }
      dhis2Url = stored.url;
    }
    const res = await launchDatasetHmisDhis2ImportRun(c.var.mainDb, {
      credentialsSource: body.credentials
        ? { kind: "inline", credentials: body.credentials }
        : { kind: "stored" },
      dhis2Url,
      selection: body.selection,
      trigger: "manual",
      triggeredBy: c.var.globalUser?.email ?? "unknown",
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    if (res.success) {
      // Flip hmisImportRunActive on every connected client now — their
      // display caches must be bypassed for the run's duration.
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// C6 — explicit queueing while a run is active (the client always asks the
// user first; queueing is never the silent default). Unattended when it
// fires, so it requires stored credentials up front.
defineRoute(
  routesDatasets,
  "enqueueDatasetHmisDhis2Run",
  requireGlobalPermission("can_configure_data"),
  log("enqueueDatasetHmisDhis2Run"),
  async (c, { body }) => {
    const stored = await getStoredDhis2CredentialsInfo(c.var.mainDb);
    if (!stored) {
      return c.json({
        success: false,
        err: "Queued imports need stored DHIS2 credentials — save credentials first.",
      });
    }
    const res = await enqueueDatasetHmisImportRun(c.var.mainDb, {
      dhis2Url: stored.url,
      selection: body.selection,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHmisImportRuns",
  requireGlobalPermission("can_view_data"),
  async (c) => {
    const res = await getDatasetHmisImportRunSummaries(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHmisImportRunDetail",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisImportRunDetail"),
  async (c, { params }) => {
    const res = await getDatasetHmisImportRunDetail(c.var.mainDb, params.run_id);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "cancelDatasetHmisDhis2Run",
  requireGlobalPermission("can_configure_data"),
  log("cancelDatasetHmisDhis2Run"),
  async (c, { body }) => {
    const res = await cancelDatasetHmisImportRun(c.var.mainDb, body.runId);
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

/////////////////////////////////////////
//                                     //
//    DHIS2 credentials + schedules    //
//                                     //
/////////////////////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHmisDhis2Scheduling",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisDhis2Scheduling"),
  async (c) => {
    const stored = await getStoredDhis2CredentialsInfo(c.var.mainDb);
    const res = {
      success: true as const,
      data: {
        schedules: await getDatasetHmisScheduledImports(c.var.mainDb),
        storedCredentials: stored ?? undefined,
        encryptionKeyConfigured: isDhis2CredentialsEncryptionKeyConfigured(),
      },
    };
    return c.json(res);
  },
);

// Schedules fire with {kind: "stored"} credentials, so they cannot be
// created or re-enabled before the instance has stored credentials.
async function assertUnattendedReady(mainDb: Sql): Promise<string | null> {
  const stored = await getStoredDhis2CredentialsInfo(mainDb);
  if (!stored) {
    return "Scheduled imports need stored DHIS2 credentials — save credentials first.";
  }
  return null;
}

defineRoute(
  routesDatasets,
  "createDatasetHmisDhis2Schedule",
  requireGlobalPermission("can_configure_data"),
  log("createDatasetHmisDhis2Schedule"),
  async (c, { body }) => {
    const blocked = await assertUnattendedReady(c.var.mainDb);
    if (blocked) {
      return c.json({ success: false, err: blocked });
    }
    const res = await createDatasetHmisScheduledImport(
      c.var.mainDb,
      body.schedule,
      c.var.globalUser?.email ?? "unknown",
    );
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "updateDatasetHmisDhis2Schedule",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetHmisDhis2Schedule"),
  async (c, { body }) => {
    // Editing a one-shot re-enables it (the re-arm gesture), so it goes
    // through the same unattended gate as create/enable.
    if (body.schedule.kind === "one_shot") {
      const blocked = await assertUnattendedReady(c.var.mainDb);
      if (blocked) {
        return c.json({ success: false, err: blocked });
      }
    }
    const res = await updateDatasetHmisScheduledImport(
      c.var.mainDb,
      body.id,
      body.schedule,
    );
    if (res.success) {
      // The edit clears the last-fire outcome — the instance-wide attention
      // banner must clear with it (review finding 5).
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "deleteDatasetHmisDhis2Schedule",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetHmisDhis2Schedule"),
  async (c, { body }) => {
    const res = await deleteDatasetHmisScheduledImport(c.var.mainDb, body.id);
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// New deletion endpoints
defineRoute(
  routesDatasets,
  "deleteAllDatasetHmisData",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllDatasetHmisData"),
  async (c, { body }) => {
    const res = await deleteAllDatasetHmisData(c.var.mainDb, body.windowing);
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

/////////////////////////////
//                         //
//    CSV import runs      //
//                         //
/////////////////////////////

// Stateless: parses headers from the named asset for the wizard's mappings
// step — no pin check, the wizard always wants current bytes. Nothing is
// persisted by this call.
defineRoute(
  routesDatasets,
  "parseDatasetHmisCsvHeaders",
  requireGlobalPermission("can_configure_data"),
  log("parseDatasetHmisCsvHeaders"),
  async (c, { body }) => {
    let filePath: string;
    try {
      ({ filePath } = await resolveAssetFileOrThrow(body.fileName, null));
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
    const res = await getCsvDetails(filePath, body.fileName);
    if (!res.success) {
      return c.json(res);
    }
    return c.json({ success: true, data: { headers: res.data.headers } });
  },
);

defineRoute(
  routesDatasets,
  "launchDatasetHmisCsvRun",
  requireGlobalPermission("can_configure_data"),
  log("launchDatasetHmisCsvRun"),
  async (c, { body }) => {
    const res = await launchDatasetHmisCsvImportRun(c.var.mainDb, {
      config: body.config,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    if (res.success) {
      // Flip hmisImportRunActive on every connected client now — their
      // display caches must be bypassed for the run's duration.
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "enqueueDatasetHmisCsvRun",
  requireGlobalPermission("can_configure_data"),
  log("enqueueDatasetHmisCsvRun"),
  async (c, { body }) => {
    const res = await enqueueDatasetHmisCsvImportRun(c.var.mainDb, {
      config: body.config,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "resolveDatasetHmisCsvReview",
  requireGlobalPermission("can_configure_data"),
  log("resolveDatasetHmisCsvReview"),
  async (c, { body }) => {
    const res = await resolveDatasetHmisCsvReview(c.var.mainDb, {
      runId: body.runId,
      action: body.action,
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    if (res.success) {
      notifyInstanceDatasetsUpdated(
        await getInstanceDatasetsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

// ============================================================================
// HFA Dataset Routes
// ============================================================================

//////////////////////////
//                      //
//    HFA Dataset detail    //
//                      //
//////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHfaDetail",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHfaDetail"),
  async (c) => {
    const res = await getDatasetHfaDetail(c.var.mainDb);
    return c.json(res);
  },
);

/////////////////////////
//                     //
//    HFA Dataset items    //
//                     //
/////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHfaDisplayInfo",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHfaDisplayInfo"),
  async (c) => {
    const tpRows = await c.var.mainDb<{ label: string; sort_order: number; imported_at: string | null }[]>`
      SELECT label, sort_order, imported_at FROM hfa_time_points ORDER BY sort_order
    `;
    const hash = computeHfaCacheHash(tpRows);

    const existing = await _FETCH_CACHE_DATASET_HFA_ITEMS.get(
      {},
      { hash },
    );

    if (existing) {
      return c.json(existing);
    }

    const newPromise = getDatasetHfaItemsForDisplay(
      c.var.mainDb,
    );

    _FETCH_CACHE_DATASET_HFA_ITEMS.setPromise(
      newPromise,
      {},
      { hash },
    );

    const res = await newPromise;
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "deleteDatasetHfaData",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetHfaData"),
  async (c, { body }) => {
    const res = await deleteDatasetHfaData(c.var.mainDb, body.timePoint);
    if (res.success) {
      notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

/////////////////////////////
//                         //
//    HFA import runs      //
//                         //
/////////////////////////////

// Stateless: parses the CSV headers from the named assets and checks the
// XLSForm's sheets, for the wizard's mappings step — no pin check, the
// wizard always wants current bytes. Nothing is persisted by this call.
defineRoute(
  routesDatasets,
  "parseDatasetHfaCsvHeaders",
  requireGlobalPermission("can_configure_data"),
  log("parseDatasetHfaCsvHeaders"),
  async (c, { body }) => {
    let csvFilePath: string;
    let xlsFormFilePath: string;
    try {
      ({ filePath: csvFilePath } = await resolveAssetFileOrThrow(
        body.csvFileName,
        null,
      ));
      ({ filePath: xlsFormFilePath } = await resolveAssetFileOrThrow(
        body.xlsFormFileName,
        null,
      ));
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
    const sheetNames = getXlsxSheetNamesRaw(xlsFormFilePath);
    if (!sheetNames.includes("survey") || !sheetNames.includes("choices")) {
      return c.json({
        success: false,
        err: "The XLSForm file must contain both 'survey' and 'choices' sheets.",
      });
    }
    const res = await getCsvDetails(csvFilePath, body.csvFileName);
    if (!res.success) {
      return c.json(res);
    }
    return c.json({ success: true, data: { headers: res.data.headers } });
  },
);

// Stateless: streams the named asset through the wizard's filters and reports
// the facilities left with several rows (the wizard's duplicates step).
defineRoute(
  routesDatasets,
  "previewDatasetHfaDuplicates",
  requireGlobalPermission("can_configure_data"),
  log("previewDatasetHfaDuplicates"),
  async (c, { body }) => {
    let filePath: string;
    try {
      ({ filePath } = await resolveAssetFileOrThrow(body.csvFileName, null));
    } catch (e) {
      return c.json({
        success: false,
        err: e instanceof Error ? e.message : String(e),
      });
    }
    const data = await scanHfaDuplicates(
      filePath,
      body.facilityIdColumn,
      body.rowFilters,
    );
    return c.json({ success: true, data });
  },
);

defineRoute(
  routesDatasets,
  "launchDatasetHfaCsvRun",
  requireGlobalPermission("can_configure_data"),
  log("launchDatasetHfaCsvRun"),
  async (c, { body }) => {
    const res = await launchDatasetHfaCsvImportRun(c.var.mainDb, {
      input: body.config,
      triggeredBy: c.var.globalUser?.email ?? "unknown",
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHfaImportRuns",
  requireGlobalPermission("can_view_data"),
  async (c) => {
    const res = await getDatasetHfaImportRunSummaries(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "resolveDatasetHfaReview",
  requireGlobalPermission("can_configure_data"),
  log("resolveDatasetHfaReview"),
  async (c, { body }) => {
    const res = await resolveDatasetHfaReview(c.var.mainDb, {
      runId: body.runId,
      action: body.action,
      onComplete: async () => {
        notifyInstanceDatasetsUpdated(
          await getInstanceDatasetsSummary(c.var.mainDb),
        );
      },
    });
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "cancelDatasetHfaRun",
  requireGlobalPermission("can_configure_data"),
  log("cancelDatasetHfaRun"),
  async (c, { body }) => {
    const res = await cancelDatasetHfaImportRun(c.var.mainDb, body.runId);
    return c.json(res);
  },
);
