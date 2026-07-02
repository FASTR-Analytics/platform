import { stringifyCsvWithHeaders } from "@timroberton/panther";
import { Hono } from "hono";
import {
  _DATASET_LIMIT,
  t3,
  type Dhis2Credentials,
  type FacilityFamily,
} from "lib";
import {
  addStructureUploadAttempt,
  deleteAllHfaFacilityWeights,
  deleteHfaFacilityWeightsForTimePoint,
  deleteAllStructureData,
  deleteFamilyFacilities,
  getHfaFacilityWeightsItems,
  getHfaFacilityWeightsSummary,
  getInstanceStructureSummary,
  importHfaFacilityWeights,
  deleteStructureUploadAttempt,
  getStructureItems,
  getStructureUploadAttempt,
  getStructureUploadStatus,
  structureStep0_SetSourceType,
  structureStep1Csv_UploadFile,
  structureStep1Dhis2_SetCredentials,
  structureStep2Csv_SetColumnMappings,
  structureStep2Dhis2_SetOrgUnitSelection,
  structureStep3Csv_StageData,
  structureStep3Csv_StageDataStreaming,
  structureStep3Dhis2_StageData,
  structureStep4_ImportData,
} from "../../db/mod.ts";
import {
  getOrgUnitMetadata,
  testDHIS2Connection,
} from "../../dhis2/goal1_org_units_v2/mod.ts";
import { resolveAssetFilePath } from "../../db/instance/assets.ts";
import { getCsvDetails } from "../../server_only_funcs_csvs/get_csv_components.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { notifyInstanceStructureUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";
import { streamResponse } from "../streaming.ts";

export const routesStructure = new Hono();

function parseFacilityFamily(raw: string): FacilityFamily | undefined {
  return raw === "hmis" || raw === "hfa" ? raw : undefined;
}

////////////////////////////
//                        //
//    Structure items    //
//                        //
////////////////////////////

defineRoute(
  routesStructure,
  "getStructureItems",
  requireGlobalPermission("can_view_data"),
  log("getStructureItems"),
  async (c, { params }) => {
    const family = parseFacilityFamily(params.family);
    if (!family) {
      return c.json({ success: false, err: "Family must be hmis or hfa" });
    }
    const res = await getStructureItems(c.var.mainDb, family, _DATASET_LIMIT);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "deleteAllStructureData",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllStructureData"),
  async (c) => {
    const res = await deleteAllStructureData(c.var.mainDb);
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "deleteFamilyFacilities",
  requireGlobalPermission("can_configure_data"),
  log("deleteFamilyFacilities"),
  async (c, { params }) => {
    const family = parseFacilityFamily(params.family);
    if (!family) {
      return c.json({ success: false, err: "Family must be hmis or hfa" });
    }
    const res = await deleteFamilyFacilities(c.var.mainDb, family);
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

////////////////////////////////////////
//                                    //
//    HFA facility sampling weights   //
//                                    //
////////////////////////////////////////

defineRoute(
  routesStructure,
  "getHfaFacilityWeightsSummary",
  requireGlobalPermission("can_view_data"),
  log("getHfaFacilityWeightsSummary"),
  async (c) => {
    const res = await getHfaFacilityWeightsSummary(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "getHfaFacilityWeightsItems",
  requireGlobalPermission("can_view_data"),
  log("getHfaFacilityWeightsItems"),
  async (c) => {
    const res = await getHfaFacilityWeightsItems(c.var.mainDb, _DATASET_LIMIT);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "readWeightsCsvHeaders",
  requireGlobalPermission("can_configure_data"),
  log("readWeightsCsvHeaders"),
  async (c, { body }) => {
    const filePath = resolveAssetFilePath(body.assetFileName);
    const res = await getCsvDetails(filePath, body.assetFileName);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "importHfaFacilityWeights",
  requireGlobalPermission("can_configure_data"),
  log("importHfaFacilityWeights"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const [{ count }] = await mainDb<{ count: number }[]>`
      SELECT COUNT(*)::int AS count FROM facilities_hfa
    `;
    if (count === 0) {
      return c.json({ success: false, err: "No HFA facilities found. Import HFA facilities before importing weights." });
    }
    const res = await importHfaFacilityWeights(
      mainDb,
      body.assetFileName,
      body.facilityIdColumn,
      body.weightColumn,
      body.timePoint,
    );
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "deleteHfaFacilityWeightsForTimePoint",
  requireGlobalPermission("can_configure_data"),
  log("deleteHfaFacilityWeightsForTimePoint"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const res = await deleteHfaFacilityWeightsForTimePoint(mainDb, body.timePoint);
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "deleteAllHfaFacilityWeights",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllHfaFacilityWeights"),
  async (c) => {
    const res = await deleteAllHfaFacilityWeights(c.var.mainDb);
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

//////////////////////////////////////
//                                  //
//    Structure upload attempts    //
//                                  //
//////////////////////////////////////

defineRoute(
  routesStructure,
  "addStructureUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("addStructureUploadAttempt"),
  async (c, { body }) => {
    const family = parseFacilityFamily(body.datasetFamily);
    if (!family) {
      return c.json({ success: false, err: "Family must be hmis or hfa" });
    }
    const res = await addStructureUploadAttempt(c.var.mainDb, family);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "getStructureUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("getStructureUploadAttempt"),
  async (c, { params }) => {
    const res = await getStructureUploadAttempt(c.var.mainDb, params.family);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "deleteStructureUploadAttempt",
  requireGlobalPermission("can_configure_data"),
  log("deleteStructureUploadAttempt"),
  async (c, { params }) => {
    const res = await deleteStructureUploadAttempt(c.var.mainDb, params.family);
    return c.json(res);
  },
);

/////////////////
//             //
//    Steps    //
//             //
/////////////////

defineRoute(
  routesStructure,
  "structureStep1Csv_UploadFile",
  requireGlobalPermission("can_configure_data"),
  log("structureStep1Csv_UploadFile"),
  async (c, { params, body }) => {
    const res = await structureStep1Csv_UploadFile(
      c.var.mainDb,
      params.family,
      body.assetFileName,
    );
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep2Csv_SetColumnMappings",
  requireGlobalPermission("can_configure_data"),
  log("structureStep2Csv_SetColumnMappings"),
  async (c, { params, body }) => {
    const res = await structureStep2Csv_SetColumnMappings(
      c.var.mainDb,
      params.family,
      body.columnMappings,
    );
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep3Csv_StageData",
  requireGlobalPermission("can_configure_data"),
  log("structureStep3Csv_StageData"),
  async (c, { params }) => {
    const res = await structureStep3Csv_StageData(c.var.mainDb, params.family);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep3Csv_StageDataStreaming",
  requireGlobalPermission("can_configure_data"),
  log("structureStep3Csv_StageDataStreaming"),
  (c, { params }) => {
    return streamResponse(c, async (writer) => {
      await writer.progress(0, "Starting CSV staging...");

      // Call the streaming version with progress callback
      const res = await structureStep3Csv_StageDataStreaming(
        c.var.mainDb,
        params.family,
        writer.progress.bind(writer),
      );

      // Handle result
      if (res.success) {
        if ("data" in res) {
          await writer.complete(res.data);
        } else {
          await writer.complete();
        }
      } else {
        await writer.error(res.err);
      }
    });
  },
);

defineRoute(
  routesStructure,
  "structureStep3Dhis2_StageData",
  requireGlobalPermission("can_configure_data"),
  log("structureStep3Dhis2_StageData"),
  async (c, { params }) => {
    const res = await structureStep3Dhis2_StageData(c.var.mainDb, params.family);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep3Dhis2_StageDataStreaming",
  requireGlobalPermission("can_configure_data"),
  log("structureStep3Dhis2_StageDataStreaming"),
  (c, { params }) => {
    return streamResponse(c, async (writer) => {
      await writer.progress(0, "Starting DHIS2 staging...");

      // Call the function with progress callback
      const res = await structureStep3Dhis2_StageData(
        c.var.mainDb,
        params.family,
        writer.progress.bind(writer),
      );

      // Handle result
      if (res.success) {
        if ("data" in res) {
          await writer.complete(res.data);
        } else {
          await writer.complete();
        }
      } else {
        await writer.error(res.err);
      }
    });
  },
);

defineRoute(
  routesStructure,
  "structureStep4_ImportData",
  requireGlobalPermission("can_configure_data"),
  log("structureStep4_ImportData"),
  async (c, { params, body }) => {
    const res = await structureStep4_ImportData(
      c.var.mainDb,
      params.family,
      body.strategy,
    );
    if (res.success) {
      notifyInstanceStructureUpdated(await getInstanceStructureSummary(c.var.mainDb));
    }
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep0_SetSourceType",
  requireGlobalPermission("can_configure_data"),
  log("structureStep0_SetSourceType"),
  async (c, { params, body }) => {
    const res = await structureStep0_SetSourceType(
      c.var.mainDb,
      params.family,
      body.sourceType,
    );
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep1Dhis2_SetCredentials",
  requireGlobalPermission("can_configure_data"),
  log("structureStep1Dhis2_SetCredentials"),
  async (c, { params, body }) => {
    // Validate credentials with DHIS2 first
    const fetchOptions = { dhis2Credentials: body };
    const connectionTest = await testDHIS2Connection(fetchOptions);

    if (!connectionTest.success) {
      return c.json({ success: false, err: t3(connectionTest.message) });
    }

    // Update database with credentials
    const res = await structureStep1Dhis2_SetCredentials(
      c.var.mainDb,
      params.family,
      body,
    );

    // No caching needed in v2 - metadata will be fetched on demand

    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep2Dhis2_SetOrgUnitSelection",
  requireGlobalPermission("can_configure_data"),
  log("structureStep2Dhis2_SetOrgUnitSelection"),
  async (c, { params, body }) => {
    const res = await structureStep2Dhis2_SetOrgUnitSelection(
      c.var.mainDb,
      params.family,
      body,
    );
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "getStructureUploadStatus",
  requireGlobalPermission("can_configure_data"),
  log("getStructureUploadStatus"),
  async (c, { params }) => {
    const res = await getStructureUploadStatus(c.var.mainDb, params.family);
    return c.json(res);
  },
);

defineRoute(
  routesStructure,
  "structureStep2Dhis2_GetOrgUnitsMetadata",
  requireGlobalPermission("can_configure_data"),
  log("structureStep2Dhis2_GetOrgUnitsMetadata"),
  async (c, { params }) => {
    // Get the current upload attempt
    const attemptRes = await getStructureUploadAttempt(
      c.var.mainDb,
      params.family,
    );
    if (!attemptRes.success) {
      return c.json({
        success: false,
        err: "No structure upload attempt found",
      });
    }

    const attempt = attemptRes.data;
    if (!attempt.step1Result) {
      return c.json({
        success: false,
        err: "No DHIS2 credentials found. Please confirm credentials first.",
      });
    }

    // Fetch metadata only (no caching, no full org unit data)
    try {
      const credentials = attempt.step1Result as Dhis2Credentials;
      const fetchOptions = { dhis2Credentials: credentials };

      const metadata = await getOrgUnitMetadata(fetchOptions);

      return c.json({
        success: true,
        data: metadata,
      });
    } catch (error) {
      return c.json({
        success: false,
        err: `Failed to fetch DHIS2 org unit metadata: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      });
    }
  },
);

// Weights CSV export — wide format: facility_id + one column per time point
routesStructure.get(
  "/structure/hfa_facility_weights/export/csv",
  requireGlobalPermission("can_configure_data"),
  log("exportHfaFacilityWeightsCsv"),
  async (c) => {
    const res = await getHfaFacilityWeightsItems(c.var.mainDb);
    if (!res.success) {
      return c.json(res);
    }
    const { headers, items } = res.data;
    const aoa = [headers, ...items.map((row) => headers.map((h) => row[h] ?? ""))];
    const csvContent = stringifyCsvWithHeaders(aoa);
    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="hfa_facility_weights.csv"',
      },
    });
  },
);

// CSV export endpoint - uses getStructureItems without limit for all rows
routesStructure.get(
  "/structure/facilities/export/csv/:family",
  requireGlobalPermission("can_configure_data"),
  log("exportStructureItemsCsv"),
  async (c) => {
    const family = parseFacilityFamily(c.req.param("family"));
    if (!family) {
      return c.json({ success: false, err: "Family must be hmis or hfa" });
    }

    // Get all facilities with proper column selection based on maxAdminArea
    const res = await getStructureItems(c.var.mainDb, family); // No limit = all rows

    if (!res.success) {
      return c.json(res);
    }

    const csvContent = stringifyCsvWithHeaders(res.data.items);

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="facilities_${family}.csv"`,
      },
    });
  },
);
