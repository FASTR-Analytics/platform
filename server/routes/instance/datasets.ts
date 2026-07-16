import { Hono } from "hono";
import type { Sql } from "postgres";
import {
  // HFA imports
  addDatasetHfaUploadAttempt,
  addDatasetHmisUploadAttempt,
  cancelDatasetHmisImportRun,
  computeHfaCacheHash,
  createDatasetHmisScheduledImport,
  deleteDatasetHfaData,
  deleteAllDatasetHmisData,
  deleteDatasetHfaUploadAttempt,
  deleteDatasetHmisScheduledImport,
  deleteDatasetHmisUploadAttempt,
  deleteStoredDhis2Credentials,
  enqueueDatasetHmisImportRun,
  getDatasetHfaDetail,
  getDatasetHfaItemsForDisplay,
  getDatasetHfaUploadAttemptDetail,
  getDatasetHfaUploadStatus,
  getDatasetHmisDetail,
  getDatasetHmisImportLedgerItems,
  getDatasetHmisImportRunDetail,
  getDatasetHmisImportRunSummaries,
  getDatasetHmisItemsForDisplay,
  getDatasetHmisScheduledImports,
  getDatasetHmisUploadAttemptDetail,
  getDatasetHmisUploadStatus,
  getStoredDhis2CredentialsInfo,
  getVersionsForDatasetHmis,
  hasShadowPassedForDhis2Url,
  isDhis2CredentialsEncryptionKeyConfigured,
  launchDatasetHmisDhis2ImportRun,
  saveStoredDhis2Credentials,
  updateDatasetHmisScheduledImport,
  updateDatasetHfaUploadAttempt_Step1CsvUpload,
  updateDatasetHfaUploadAttempt_Step2Mappings,
  updateDatasetHfaUploadAttempt_Step3Staging,
  updateDatasetHfaUploadAttempt_Step4Integrate,
  updateDatasetUploadAttempt_Step0SourceType,
  updateDatasetUploadAttempt_Step1CsvUpload,
  updateDatasetUploadAttempt_Step2Mappings,
  updateDatasetUploadAttempt_Step3Staging,
  updateDatasetUploadAttempt_Step4Integrate,
  getInstanceDatasetsSummary,
} from "../../db/mod.ts";
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
  log("getDatasetHmisDetail"),
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
      body.facilityColumns,
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
  log("getDatasetHmisImportRuns"),
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
        unattendedReady: stored
          ? await hasShadowPassedForDhis2Url(c.var.mainDb, stored.url)
          : false,
      },
    };
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "saveDatasetHmisDhis2Credentials",
  requireGlobalPermission("can_configure_data"),
  log("saveDatasetHmisDhis2Credentials"),
  async (c, { body }) => {
    if (!isDhis2CredentialsEncryptionKeyConfigured()) {
      return c.json({
        success: false,
        err: "DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on this server — credentials cannot be stored.",
      });
    }
    const validation = await validateDhis2Connection(body.credentials);
    if (!validation.valid) {
      return c.json({ success: false, err: t3(validation.message) });
    }
    await saveStoredDhis2Credentials(
      c.var.mainDb,
      body.credentials,
      c.var.globalUser?.email ?? "unknown",
    );
    return c.json({ success: true });
  },
);

defineRoute(
  routesDatasets,
  "deleteDatasetHmisDhis2Credentials",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetHmisDhis2Credentials"),
  async (c) => {
    await deleteStoredDhis2Credentials(c.var.mainDb);
    return c.json({ success: true });
  },
);

// The §7 C4 unattended-gate enforcement at the editor: schedules cannot be
// created or re-enabled before the instance has stored credentials and a
// shadow-verified run against their URL (the tick re-checks at fire time —
// repointing the DHIS2 URL re-arms shadow and must also re-block fires).
async function assertUnattendedReady(mainDb: Sql): Promise<string | null> {
  const stored = await getStoredDhis2CredentialsInfo(mainDb);
  if (!stored) {
    return "Scheduled imports need stored DHIS2 credentials — save credentials first.";
  }
  if (!(await hasShadowPassedForDhis2Url(mainDb, stored.url))) {
    return `Scheduled imports are blocked until an import against ${stored.url} has shadow-verified cleanly. Run an import directly first.`;
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

///////////////////////////////////
//                               //
//    Dataset upload attempts    //
//                               //
///////////////////////////////////

defineRoute(
  routesDatasets,
  "createDatasetUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("createDatasetUploadAttempt"),
  async (c) => {
    const mainDb = c.var.mainDb;
    const [{ count }] = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hmis
    `;
    if (count === 0) {
      return c.json({ success: false, err: "No HMIS facilities found. Import HMIS facilities before importing data." });
    }
    const res = await addDatasetHmisUploadAttempt(mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "setDatasetUploadSourceType",
  requireGlobalPermission("can_configure_data"),
  log("setDatasetUploadSourceType"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step0SourceType(
      c.var.mainDb,
      body.sourceType,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetUpload",
  requireGlobalPermission("can_configure_data"),
  log("getDatasetUpload"),
  async (c) => {
    const res = await getDatasetHmisUploadAttemptDetail(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetUploadStatus",
  requireGlobalPermission("can_configure_data"),
  log("getDatasetUploadStatus"),
  async (c) => {
    const res = await getDatasetHmisUploadStatus(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "deleteDatasetUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetUploadAttempt"),
  async (c) => {
    const res = await deleteDatasetHmisUploadAttempt(c.var.mainDb);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

defineRoute(
  routesDatasets,
  "uploadDatasetCsv",
  requireGlobalPermission("can_configure_data"),
  log("uploadDatasetCsv"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step1CsvUpload(
      c.var.mainDb,
      body.assetFileName,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "updateDatasetMappings",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetMappings"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step2Mappings(
      c.var.mainDb,
      body.mappings,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "updateDatasetStaging",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetStaging"),
  async (c) => {
    const res = await updateDatasetUploadAttempt_Step3Staging(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "finalizeDatasetIntegration",
  requireGlobalPermission("can_configure_data"),
  log("finalizeDatasetIntegration"),
  async (c) => {
    const res = await updateDatasetUploadAttempt_Step4Integrate(
      c.var.mainDb,
      async () => {
        notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
      },
    );
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

///////////////////////////////////
//                               //
//    HFA Dataset upload attempts    //
//                               //
///////////////////////////////////

defineRoute(
  routesDatasets,
  "createDatasetHfaUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("createDatasetHfaUploadAttempt"),
  async (c) => {
    const mainDb = c.var.mainDb;
    const [{ count }] = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hfa
    `;
    if (count === 0) {
      return c.json({ success: false, err: "No HFA facilities found. Import HFA facilities before importing data." });
    }
    const res = await addDatasetHfaUploadAttempt(mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHfaUpload",
  requireGlobalPermission("can_configure_data"),
  log("getDatasetHfaUpload"),
  async (c) => {
    const res = await getDatasetHfaUploadAttemptDetail(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "getDatasetHfaUploadStatus",
  requireGlobalPermission("can_configure_data"),
  log("getDatasetHfaUploadStatus"),
  async (c) => {
    const res = await getDatasetHfaUploadStatus(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "deleteDatasetHfaUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("deleteDatasetHfaUploadAttempt"),
  async (c) => {
    const res = await deleteDatasetHfaUploadAttempt(c.var.mainDb);
    return c.json(res);
  },
);

///////////////////////////////////////////////////////////////////////////////////
// HFA CSV Upload Steps
///////////////////////////////////////////////////////////////////////////////////

defineRoute(
  routesDatasets,
  "uploadDatasetHfaCsv",
  requireGlobalPermission("can_configure_data"),
  log("uploadDatasetHfaCsv"),
  async (c, { body }) => {
    const res = await updateDatasetHfaUploadAttempt_Step1CsvUpload(
      c.var.mainDb,
      body.csvAssetFileName,
      body.xlsFormAssetFileName,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "updateDatasetHfaMappings",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetHfaMappings"),
  async (c, { body }) => {
    const res = await updateDatasetHfaUploadAttempt_Step2Mappings(
      c.var.mainDb,
      body.mappings,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "updateDatasetHfaStaging",
  requireGlobalPermission("can_configure_data"),
  log("updateDatasetHfaStaging"),
  async (c) => {
    const res = await updateDatasetHfaUploadAttempt_Step3Staging(
      c.var.mainDb,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "finalizeDatasetHfaIntegration",
  requireGlobalPermission("can_configure_data"),
  log("finalizeDatasetHfaIntegration"),
  async (c) => {
    const res = await updateDatasetHfaUploadAttempt_Step4Integrate(
      c.var.mainDb,
      async () => {
        notifyInstanceDatasetsUpdated(await getInstanceDatasetsSummary(c.var.mainDb));
      },
    );
    return c.json(res);
  },
);
