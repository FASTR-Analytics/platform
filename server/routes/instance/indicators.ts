import { Hono } from "hono";
import {
  batchUploadIndicators,
  batchUploadRawIndicators,
  createIndicatorsCommon,
  createIndicatorsRaw,
  deleteAllIndicators,
  deleteIndicatorCommon,
  deleteIndicatorRaw,
  getIndicatorsWithMappings,
  updateIndicatorCommon,
  updateIndicatorRaw,
} from "../../db/mod.ts";
import { getGlobalAdmin } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { log } from "../../middleware/logging.ts";
import { requireGlobalPermission } from "../../middleware/mod.ts";

export const routesIndicators = new Hono();

// GET /indicators - Get all indicators with their mappings
defineRoute(routesIndicators, "getIndicators", requireGlobalPermission("can_configure_data"), log("getIndicators"), async (c) => {
  const res = await getIndicatorsWithMappings(c.var.mainDb);
  return c.json(res);
});

//////////////////////////////////////////////////////////////////////////
//   ______                                                             //
//  /      \                                                            //
// /$$$$$$  |  ______   _____  ____   _____  ____    ______   _______   //
// $$ |  $$/  /      \ /     \/    \ /     \/    \  /      \ /       \  //
// $$ |      /$$$$$$  |$$$$$$ $$$$  |$$$$$$ $$$$  |/$$$$$$  |$$$$$$$  | //
// $$ |   __ $$ |  $$ |$$ | $$ | $$ |$$ | $$ | $$ |$$ |  $$ |$$ |  $$ | //
// $$ \__/  |$$ \__$$ |$$ | $$ | $$ |$$ | $$ | $$ |$$ \__$$ |$$ |  $$ | //
// $$    $$/ $$    $$/ $$ | $$ | $$ |$$ | $$ | $$ |$$    $$/ $$ |  $$ | //
//  $$$$$$/   $$$$$$/  $$/  $$/  $$/ $$/  $$/  $$/  $$$$$$/  $$/   $$/  //
//                                                                      //
//////////////////////////////////////////////////////////////////////////

// POST /indicators - Create new indicators
defineRoute(
  routesIndicators,
  "createCommonIndicators",
  requireGlobalPermission("can_configure_data"),
  log("createCommonIndicators"),
  async (c, { body }) => {
    // Validate required fields
    if (!Array.isArray(body.indicators)) {
      return c.json({
        success: false,
        err: "indicators array is required",
      });
    }

    // Validate each indicator in the array
    for (const indicator of body.indicators) {
      if (
        !indicator.indicator_common_id ||
        !indicator.indicator_common_label ||
        !Array.isArray(indicator.mapped_raw_ids)
      ) {
        return c.json({
          success: false,
          err: "Each indicator must have indicator_common_id, indicator_common_label, and mapped_raw_ids",
        });
      }
    }

    const res = await createIndicatorsCommon(c.var.mainDb, body.indicators);
    return c.json(res);
  }
);

// POST /indicators/update - Update indicator
defineRoute(
  routesIndicators,
  "updateCommonIndicator",
  requireGlobalPermission("can_configure_data"),
  log("updateCommonIndicator"),
  async (c, { body }) => {
    if (
      !body.old_indicator_common_id ||
      !body.new_indicator_common_id ||
      !body.indicator_common_label ||
      !Array.isArray(body.mapped_raw_ids)
    ) {
      return c.json({
        success: false,
        err: "old_indicator_common_id, new_indicator_common_id, indicator_common_label, and mapped_raw_ids are required",
      });
    }

    const res = await updateIndicatorCommon(
      c.var.mainDb,
      body.old_indicator_common_id,
      body.new_indicator_common_id,
      body.indicator_common_label,
      body.mapped_raw_ids
    );
    return c.json(res);
  }
);

// POST /indicators/delete - Delete indicators (cascades to mappings)
defineRoute(
  routesIndicators,
  "deleteCommonIndicators",
  requireGlobalPermission("can_configure_data"),
  log("deleteCommonIndicators"),
  async (c, { body }) => {
    if (!Array.isArray(body.indicator_common_ids)) {
      return c.json({
        success: false,
        err: "indicator_common_ids must be an array",
      });
    }

    const res = await deleteIndicatorCommon(
      c.var.mainDb,
      body.indicator_common_ids
    );
    return c.json(res);
  }
);

////////////////////////////////////////
//  _______                           //
// /       \                          //
// $$$$$$$  |  ______   __   __   __  //
// $$ |__$$ | /      \ /  | /  | /  | //
// $$    $$<  $$$$$$  |$$ | $$ | $$ | //
// $$$$$$$  | /    $$ |$$ | $$ | $$ | //
// $$ |  $$ |/$$$$$$$ |$$ \_$$ \_$$ | //
// $$ |  $$ |$$    $$ |$$   $$   $$/  //
// $$/   $$/  $$$$$$$/  $$$$$/$$$$/   //
//                                    //
////////////////////////////////////////

// POST /indicators-raw - Create raw indicators
defineRoute(
  routesIndicators,
  "createRawIndicators",
  requireGlobalPermission("can_configure_data"),
  log("createRawIndicators"),
  async (c, { body }) => {
    // Validate required fields
    if (!Array.isArray(body.indicators)) {
      return c.json({
        success: false,
        err: "indicators array is required",
      });
    }

    // Validate each indicator in the array
    for (const indicator of body.indicators) {
      if (
        !indicator.indicator_raw_id ||
        !indicator.indicator_raw_label ||
        !Array.isArray(indicator.mapped_common_ids)
      ) {
        return c.json({
          success: false,
          err: "Each indicator must have indicator_raw_id, indicator_raw_label, and mapped_common_ids",
        });
      }
    }

    const res = await createIndicatorsRaw(c.var.mainDb, body.indicators);
    return c.json(res);
  }
);

// POST /indicators-raw/update - Update raw indicator
defineRoute(
  routesIndicators,
  "updateRawIndicator",
  requireGlobalPermission("can_configure_data"),
  log("updateRawIndicator"),
  async (c, { body }) => {
    if (
      !body.old_indicator_raw_id ||
      !body.new_indicator_raw_id ||
      !body.indicator_raw_label ||
      !Array.isArray(body.mapped_common_ids)
    ) {
      return c.json({
        success: false,
        err: "old_indicator_raw_id, new_indicator_raw_id, indicator_raw_label, and mapped_common_ids are required",
      });
    }

    const res = await updateIndicatorRaw(
      c.var.mainDb,
      body.old_indicator_raw_id,
      body.new_indicator_raw_id,
      body.indicator_raw_label,
      body.mapped_common_ids
    );
    return c.json(res);
  }
);

// POST /indicators-raw/delete - Delete raw indicators
defineRoute(
  routesIndicators,
  "deleteRawIndicators",
  requireGlobalPermission("can_configure_data"),
  log("deleteRawIndicators"),
  async (c, { body }) => {
    if (!Array.isArray(body.indicator_raw_ids)) {
      return c.json({
        success: false,
        err: "indicator_raw_ids must be an array",
      });
    }

    const res = await deleteIndicatorRaw(c.var.mainDb, body.indicator_raw_ids);
    return c.json(res);
  }
);

////////////////////////////////////////////////////////
//  _______               __                __        //
// /       \             /  |              /  |       //
// $$$$$$$  |  ______   _$$ |_     _______ $$ |____   //
// $$ |__$$ | /      \ / $$   |   /       |$$      \  //
// $$    $$<  $$$$$$  |$$$$$$/   /$$$$$$$/ $$$$$$$  | //
// $$$$$$$  | /    $$ |  $$ | __ $$ |      $$ |  $$ | //
// $$ |__$$ |/$$$$$$$ |  $$ |/  |$$ \_____ $$ |  $$ | //
// $$    $$/ $$    $$ |  $$  $$/ $$       |$$ |  $$ | //
// $$$$$$$/   $$$$$$$/    $$$$/   $$$$$$$/ $$/   $$/  //
//                                                    //
////////////////////////////////////////////////////////

// POST /indicators/batch - Batch upload indicators with mappings from CSV file
defineRoute(
  routesIndicators,
  "batchUploadIndicators",
  requireGlobalPermission("can_configure_data"),
  log("batchUploadIndicators"),
  async (c, { body }) => {
    // Validate that asset_file_name is provided
    if (!body.asset_file_name || typeof body.asset_file_name !== "string") {
      return c.json({
        success: false,
        err: "asset_file_name is required and must be a string",
      });
    }

    const res = await batchUploadIndicators(
      c.var.mainDb,
      body.asset_file_name,
      body.replace_all_existing
    );
    return c.json(res);
  }
);

// POST /indicators/batch-raw - Batch upload raw indicators from CSV file
defineRoute(
  routesIndicators,
  "batchUploadRawIndicators",
  getGlobalAdmin,
  async (c, { body }) => {
    if (!body.asset_file_name || typeof body.asset_file_name !== "string") {
      return c.json({
        success: false,
        err: "asset_file_name is required and must be a string",
      });
    }

    const res = await batchUploadRawIndicators(
      c.var.mainDb,
      body.asset_file_name,
      body.replace_all_existing
    );
    return c.json(res);
  }
);

// DELETE /indicators/all - Delete all non-default indicators and their mappings
defineRoute(
  routesIndicators,
  "deleteAllIndicators",
  requireGlobalPermission("can_configure_data"),
  log("deleteAllIndicators"),
  async (c) => {
    const res = await deleteAllIndicators(c.var.mainDb);
    return c.json(res);
  }
);
