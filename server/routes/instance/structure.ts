import { stringifyCsvWithHeaders } from "@timroberton/panther";
import { Hono } from "hono";
import {
  addStructureUploadAttempt,
  deleteAllStructureData,
  deleteStructureUploadAttempt,
  structureStep3Csv_StageData,
  structureStep3Csv_StageDataStreaming,
  structureStep3Dhis2_StageData,
  structureStep4_ImportData,
  getStructureItems,
  getStructureUploadAttempt,
  getStructureUploadStatus,
  structureStep0_SetSourceType,
  structureStep1Csv_UploadFile,
  structureStep1Dhis2_SetCredentials,
  structureStep2Csv_SetColumnMappings,
  structureStep2Dhis2_SetOrgUnitSelection,
} from "../../db/mod.ts";
import {
  getOrgUnitMetadata,
  testDHIS2Connection,
} from "../../dhis2/goal1_org_units_v2/mod.ts";
import { _DATASET_LIMIT, type Dhis2Credentials } from "lib";
import { getGlobalAdmin, getGlobalNonAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { streamResponse } from "../streaming.ts";
import { log } from "../../middleware/logging.ts";

export const routesStructure = new Hono();

////////////////////////////
//                        //
//    Structure items    //
//                        //
////////////////////////////

defineRoute(
  routesStructure,
  "getStructureItems",
  getGlobalNonAdmin,
  log("getStructureItems"),
  async (c) => {
    const res = await getStructureItems(c.var.mainDb, _DATASET_LIMIT);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "deleteAllStructureData",
  getGlobalAdmin,
  log("deleteAllStructureData"),
  async (c) => {
    const res = await deleteAllStructureData(c.var.mainDb);
    return c.json(res);
  }
);

//////////////////////////////////////
//                                  //
//    Structure upload attempts    //
//                                  //
//////////////////////////////////////

defineRoute(
  routesStructure,
  "addStructureUploadAttempt",
  getGlobalAdmin,
  log("addStructureUploadAttempt"),
  async (c) => {
    const res = await addStructureUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "getStructureUploadAttempt",
  getGlobalAdmin,
  log("getStructureUploadAttempt"),
  async (c) => {
    const res = await getStructureUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "deleteStructureUploadAttempt",
  getGlobalAdmin,
  log("deleteStructureUploadAttempt"),
  async (c) => {
    const res = await deleteStructureUploadAttempt(c.var.mainDb);
    return c.json(res);
  }
);

/////////////////
//             //
//    Steps    //
//             //
/////////////////

defineRoute(
  routesStructure,
  "structureStep1Csv_UploadFile",
  getGlobalAdmin,
  log("structureStep1Csv_UploadFile"),
  async (c, { body }) => {
    const res = await structureStep1Csv_UploadFile(
      c.var.mainDb,
      body.assetFileName
    );
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep2Csv_SetColumnMappings",
  getGlobalAdmin,
  log("structureStep2Csv_SetColumnMappings"),
  async (c, { body }) => {
    const res = await structureStep2Csv_SetColumnMappings(
      c.var.mainDb,
      body.columnMappings
    );
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep3Csv_StageData",
  getGlobalAdmin,
  log("structureStep3Csv_StageData"),
  async (c) => {
    const res = await structureStep3Csv_StageData(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep3Csv_StageDataStreaming",
  getGlobalAdmin,
  log("structureStep3Csv_StageDataStreaming"),
  (c) => {
    return streamResponse(c, async (writer) => {
      await writer.progress(0, "Starting CSV staging...");

      // Call the streaming version with progress callback
      const res = await structureStep3Csv_StageDataStreaming(
        c.var.mainDb,
        writer.progress.bind(writer)
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
  }
);

defineRoute(
  routesStructure,
  "structureStep3Dhis2_StageData",
  getGlobalAdmin,
  log("structureStep3Dhis2_StageData"),
  async (c) => {
    const res = await structureStep3Dhis2_StageData(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep3Dhis2_StageDataStreaming",
  getGlobalAdmin,
  log("structureStep3Dhis2_StageDataStreaming"),
  (c) => {
    return streamResponse(c, async (writer) => {
      await writer.progress(0, "Starting DHIS2 staging...");

      // Call the function with progress callback
      const res = await structureStep3Dhis2_StageData(
        c.var.mainDb,
        writer.progress.bind(writer)
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
  }
);

defineRoute(
  routesStructure,
  "structureStep4_ImportData",
  getGlobalAdmin,
  log("structureStep4_ImportData"),
  async (c, { body }) => {
    const res = await structureStep4_ImportData(c.var.mainDb, body.strategy);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep0_SetSourceType",
  getGlobalAdmin,
  log("structureStep0_SetSourceType"),
  async (c, { body }) => {
    const res = await structureStep0_SetSourceType(
      c.var.mainDb,
      body.sourceType
    );
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep1Dhis2_SetCredentials",
  getGlobalAdmin,
  log("structureStep1Dhis2_SetCredentials"),
  async (c, { body }) => {
    // Validate credentials with DHIS2 first
    const fetchOptions = { dhis2Credentials: body };
    const connectionTest = await testDHIS2Connection(fetchOptions);

    if (!connectionTest.success) {
      return c.json({ success: false, err: connectionTest.message });
    }

    // Update database with credentials
    const res = await structureStep1Dhis2_SetCredentials(c.var.mainDb, body);

    // No caching needed in v2 - metadata will be fetched on demand

    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep2Dhis2_SetOrgUnitSelection",
  getGlobalAdmin,
  log("structureStep2Dhis2_SetOrgUnitSelection"),
  async (c, { body }) => {
    const res = await structureStep2Dhis2_SetOrgUnitSelection(
      c.var.mainDb,
      body
    );
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "getStructureUploadStatus",
  getGlobalAdmin,
  log("getStructureUploadStatus"),
  async (c) => {
    const res = await getStructureUploadStatus(c.var.mainDb);
    return c.json(res);
  }
);

defineRoute(
  routesStructure,
  "structureStep2Dhis2_GetOrgUnitsMetadata",
  getGlobalAdmin,
  log("structureStep2Dhis2_GetOrgUnitsMetadata"),
  async (c) => {
    // Get the current upload attempt
    const attemptRes = await getStructureUploadAttempt(c.var.mainDb);
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
  }
);

// CSV export endpoint - uses getStructureItems without limit for all rows
routesStructure.get(
  "/structure/facilities/export/csv",
  getGlobalNonAdmin,
  log("exportStructureItemsCsv"),
  async (c) => {
    // Get all facilities with proper column selection based on maxAdminArea
    const res = await getStructureItems(c.var.mainDb); // No limit = all rows

    if (!res.success) {
      return c.json(res);
    }

    const csvContent = stringifyCsvWithHeaders(res.data.items);

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="facilities.csv"',
      },
    });
  }
);
