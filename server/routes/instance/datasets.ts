import { Hono } from "hono";
import {
  // HFA imports
  addDatasetHfaUploadAttempt,
  addDatasetHmisUploadAttempt,
  deleteAllDatasetHfaData,
  deleteAllDatasetHmisData,
  deleteDatasetHfaUploadAttempt,
  deleteDatasetHmisUploadAttempt,
  getDatasetHfaDetail,
  getDatasetHfaItemsForDisplay,
  getDatasetHfaUploadAttemptDetail,
  getDatasetHfaUploadStatus,
  getDatasetHmisDetail,
  getDatasetHmisItemsForDisplay,
  getDatasetHmisUploadAttemptDetail,
  getDatasetHmisUploadStatus,
  getVersionsForDatasetHfa,
  getVersionsForDatasetHmis,
  updateDatasetHfaUploadAttempt_Step1CsvUpload,
  updateDatasetHfaUploadAttempt_Step2Mappings,
  updateDatasetHfaUploadAttempt_Step3Staging,
  updateDatasetHfaUploadAttempt_Step4Integrate,
  updateDatasetUploadAttempt_Step0SourceType,
  updateDatasetUploadAttempt_Step1CsvUpload,
  updateDatasetUploadAttempt_Step1Dhis2Confirm,
  updateDatasetUploadAttempt_Step2Dhis2Selection,
  updateDatasetUploadAttempt_Step2Mappings,
  updateDatasetUploadAttempt_Step3Staging,
  updateDatasetUploadAttempt_Step4Integrate,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import {
  _FETCH_CACHE_DATASET_HFA_ITEMS,
  _FETCH_CACHE_DATASET_HMIS_ITEMS,
} from "../caches/dataset.ts";
import { defineRoute } from "../route-helpers.ts";

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
  "getDatasetHmisDisplayInfo",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHmisDisplayInfo"),
  async (c, { body }) => {
    const existing = await _FETCH_CACHE_DATASET_HMIS_ITEMS.get(
      {
        rawOrCommonIndicators: body.rawOrCommonIndicators,
        facilityColumns: body.facilityColumns,
      },
      {
        versionId: body.versionId,
        indicatorMappingsVersion: body.indicatorMappingsVersion,
      },
    );

    if (existing) {
      return c.json(existing);
    }

    const newPromise = getDatasetHmisItemsForDisplay(
      c.var.mainDb,
      body.versionId,
      body.indicatorMappingsVersion,
      body.rawOrCommonIndicators,
      body.facilityColumns,
    );

    _FETCH_CACHE_DATASET_HMIS_ITEMS.setPromise(
      newPromise,
      {
        rawOrCommonIndicators: body.rawOrCommonIndicators,
        facilityColumns: body.facilityColumns,
      },
      {
        versionId: body.versionId,
        indicatorMappingsVersion: body.indicatorMappingsVersion,
      },
    );

    const res = await newPromise;
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
    const res = await addDatasetHmisUploadAttempt(c.var.mainDb);
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
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step3Staging(
      c.var.mainDb,
      body.failFastMode,
      c.req.raw.signal,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "finalizeDatasetIntegration",
  requireGlobalPermission("can_configure_data"),
  log("finalizeDatasetIntegration"),
  async (c) => {
    const res = await updateDatasetUploadAttempt_Step4Integrate(c.var.mainDb);
    return c.json(res);
  },
);

// DHIS2-specific endpoints
defineRoute(
  routesDatasets,
  "dhis2ConfirmCredentials",
  requireGlobalPermission("can_configure_data"),
  log("dhis2ConfirmCredentials"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step1Dhis2Confirm(
      c.var.mainDb,
      body,
    );
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "dhis2SetSelection",
  requireGlobalPermission("can_configure_data"),
  log("dhis2SetSelection"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step2Dhis2Selection(
      c.var.mainDb,
      body,
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

defineRoute(
  routesDatasets,
  "getDatasetHfaVersions",
  requireGlobalPermission("can_view_data"),
  log("getDatasetHfaVersions"),
  async (c) => {
    const res = await getVersionsForDatasetHfa(c.var.mainDb);
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
  async (c, { body }) => {
    const existing = await _FETCH_CACHE_DATASET_HFA_ITEMS.get(
      {},
      { versionId: body.versionId },
    );

    if (existing) {
      return c.json(existing);
    }

    const newPromise = getDatasetHfaItemsForDisplay(
      c.var.mainDb,
      body.versionId,
    );

    _FETCH_CACHE_DATASET_HFA_ITEMS.setPromise(
      newPromise,
      {},
      {
        versionId: body.versionId,
      },
    );

    const res = await newPromise;
    return c.json(res);
  },
);

defineRoute(
  routesDatasets,
  "deleteAllDatasetHfaData",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllDatasetHfaData"),
  async (c) => {
    const res = await deleteAllDatasetHfaData(c.var.mainDb);
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
    const res = await addDatasetHfaUploadAttempt(c.var.mainDb);
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
      body.assetFileName,
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
      c.req.raw.signal,
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
    );
    return c.json(res);
  },
);
