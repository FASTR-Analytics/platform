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
import { getGlobalAdmin, getGlobalNonAdmin } from "../../project_auth.ts";
import {
  _FETCH_CACHE_DATASET_HFA_ITEMS,
  _FETCH_CACHE_DATASET_HMIS_ITEMS,
} from "../caches/dataset.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";

export const routesDatasets = new Hono();

//////////////////////////
//                      //
//    Dataset detail    //
//                      //
//////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHmisDetail",
  getGlobalNonAdmin,
  log("getDatasetHmisDetail"),
  async (c) => {
    const res = await getDatasetHmisDetail(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "getDatasetHmisVersions",
  getGlobalNonAdmin,
  log("getDatasetHmisVersions"),
  async (c) => {
    const res = await getVersionsForDatasetHmis(c.var.mainDb);
    return c.json(res);
  }
);

/////////////////////////
//                     //
//    Dataset items    //
//                     //
/////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHmisDisplayInfo",
  getGlobalNonAdmin,
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
      }
    );

    if (existing) {
      return c.json(existing);
    }

    const newPromise = getDatasetHmisItemsForDisplay(
      c.var.mainDb,
      body.versionId,
      body.indicatorMappingsVersion,
      body.rawOrCommonIndicators,
      body.facilityColumns
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
      }
    );

    const res = await newPromise;
    return c.json(res);
  }
);

// New deletion endpoints
defineRoute(
  routesDatasets,
  "deleteAllDatasetHmisData",
  getGlobalAdmin,
  log("deleteAllDatasetHmisData"),
  async (c, { body }) => {
    const res = await deleteAllDatasetHmisData(c.var.mainDb, body.windowing);
    return c.json(res);
  }
);

///////////////////////////////////
//                               //
//    Dataset upload attempts    //
//                               //
///////////////////////////////////

defineRoute(
  routesDatasets,
  "createDatasetUploadAttempt",
  getGlobalAdmin,
  log("createDatasetUploadAttempt"),
  async (c) => {
    const res = await addDatasetHmisUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "setDatasetUploadSourceType",
  getGlobalAdmin,
  log("setDatasetUploadSourceType"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step0SourceType(
      c.var.mainDb,
      body.sourceType
    );
    return c.json(res);
  }
);

defineRoute(routesDatasets, "getDatasetUpload", getGlobalAdmin, log("getDatasetUpload"), async (c) => {
  const res = await getDatasetHmisUploadAttemptDetail(c.var.mainDb);
  return c.json(res);
});

defineRoute(
  routesDatasets,
  "getDatasetUploadStatus",
  getGlobalAdmin,
  log("getDatasetUploadStatus"),
  async (c) => {
    const res = await getDatasetHmisUploadStatus(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "deleteDatasetUploadAttempt",
  getGlobalAdmin,
  log("deleteDatasetUploadAttempt"),
  async (c) => {
    const res = await deleteDatasetHmisUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////
///////////////////////////////////////////////////////////////////////////////////

defineRoute(
  routesDatasets,
  "uploadDatasetCsv",
  getGlobalAdmin,
  log("uploadDatasetCsv"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step1CsvUpload(
      c.var.mainDb,
      body.assetFileName
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "updateDatasetMappings",
  getGlobalAdmin,
  log("updateDatasetMappings"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step2Mappings(
      c.var.mainDb,
      body.mappings
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "updateDatasetStaging",
  getGlobalAdmin,
  log("updateDatasetStaging"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step3Staging(
      c.var.mainDb,
      body.failFastMode,
      c.req.raw.signal
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "finalizeDatasetIntegration",
  getGlobalAdmin,
  log("finalizeDatasetIntegration"),
  async (c) => {
    const res = await updateDatasetUploadAttempt_Step4Integrate(c.var.mainDb);
    return c.json(res);
  }
);

// DHIS2-specific endpoints
defineRoute(
  routesDatasets,
  "dhis2ConfirmCredentials",
  getGlobalAdmin,
  log("dhis2ConfirmCredentials"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step1Dhis2Confirm(
      c.var.mainDb,
      body
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "dhis2SetSelection",
  getGlobalAdmin,
  log("dhis2SetSelection"),
  async (c, { body }) => {
    const res = await updateDatasetUploadAttempt_Step2Dhis2Selection(
      c.var.mainDb,
      body
    );
    return c.json(res);
  }
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
  getGlobalNonAdmin,
  log("getDatasetHfaDetail"),
  async (c) => {
    const res = await getDatasetHfaDetail(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "getDatasetHfaVersions",
  getGlobalNonAdmin,
  log("getDatasetHfaVersions"),
  async (c) => {
    const res = await getVersionsForDatasetHfa(c.var.mainDb);
    return c.json(res);
  }
);

/////////////////////////
//                     //
//    HFA Dataset items    //
//                     //
/////////////////////////

defineRoute(
  routesDatasets,
  "getDatasetHfaDisplayInfo",
  getGlobalNonAdmin,
  log("getDatasetHfaDisplayInfo"),
  async (c, { body }) => {
    const existing = await _FETCH_CACHE_DATASET_HFA_ITEMS.get(
      {},
      { versionId: body.versionId }
    );

    if (existing) {
      return c.json(existing);
    }

    const newPromise = getDatasetHfaItemsForDisplay(
      c.var.mainDb,
      body.versionId
    );

    _FETCH_CACHE_DATASET_HFA_ITEMS.setPromise(
      newPromise,
      {},
      {
        versionId: body.versionId,
      }
    );

    const res = await newPromise;
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "deleteAllDatasetHfaData",
  getGlobalAdmin,
  log("deleteAllDatasetHfaData"),
  async (c) => {
    const res = await deleteAllDatasetHfaData(c.var.mainDb);
    return c.json(res);
  }
);

///////////////////////////////////
//                               //
//    HFA Dataset upload attempts    //
//                               //
///////////////////////////////////

defineRoute(
  routesDatasets,
  "createDatasetHfaUploadAttempt",
  getGlobalAdmin,
  log("createDatasetHfaUploadAttempt"),
  async (c) => {
    const res = await addDatasetHfaUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "getDatasetHfaUpload",
  getGlobalAdmin,
  log("getDatasetHfaUpload"),
  async (c) => {
    const res = await getDatasetHfaUploadAttemptDetail(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "getDatasetHfaUploadStatus",
  getGlobalAdmin,
  log("getDatasetHfaUploadStatus"),
  async (c) => {
    const res = await getDatasetHfaUploadStatus(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "deleteDatasetHfaUploadAttempt",
  getGlobalAdmin,
  log("deleteDatasetHfaUploadAttempt"),
  async (c) => {
    const res = await deleteDatasetHfaUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

///////////////////////////////////////////////////////////////////////////////////
// HFA CSV Upload Steps
///////////////////////////////////////////////////////////////////////////////////

defineRoute(
  routesDatasets,
  "uploadDatasetHfaCsv",
  getGlobalAdmin,
  log("uploadDatasetHfaCsv"),
  async (c, { body }) => {
    const res = await updateDatasetHfaUploadAttempt_Step1CsvUpload(
      c.var.mainDb,
      body.assetFileName
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "updateDatasetHfaMappings",
  getGlobalAdmin,
  log("updateDatasetHfaMappings"),
  async (c, { body }) => {
    const res = await updateDatasetHfaUploadAttempt_Step2Mappings(
      c.var.mainDb,
      body.mappings
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "updateDatasetHfaStaging",
  getGlobalAdmin,
  log("updateDatasetHfaStaging"),
  async (c) => {
    const res = await updateDatasetHfaUploadAttempt_Step3Staging(
      c.var.mainDb,
      c.req.raw.signal
    );
    return c.json(res);
  }
);

defineRoute(
  routesDatasets,
  "finalizeDatasetHfaIntegration",
  getGlobalAdmin,
  log("finalizeDatasetHfaIntegration"),
  async (c) => {
    const res = await updateDatasetHfaUploadAttempt_Step4Integrate(
      c.var.mainDb
    );
    return c.json(res);
  }
);
