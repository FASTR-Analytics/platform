import type { InstanceIndicatorDetails } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const indicatorRouteRegistry = {
  // Get all indicators with mappings
  getIndicators: route({
    path: "/indicators",
    method: "GET",
    response: {} as InstanceIndicatorDetails,
  }),

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

  // Create indicators (plural)
  createCommonIndicators: route({
    path: "/indicators",
    method: "POST",
    body: {} as {
      indicators: Array<{
        indicator_common_id: string;
        indicator_common_label: string;
        mapped_raw_ids: string[];
      }>;
    },
  }),

  // Update indicator
  updateCommonIndicator: route({
    path: "/indicators/update",
    method: "POST",
    body: {} as {
      old_indicator_common_id: string;
      new_indicator_common_id: string;
      indicator_common_label: string;
      mapped_raw_ids: string[];
    },
  }),

  // Delete indicators (cascades to mappings)
  deleteCommonIndicators: route({
    path: "/indicators/delete",
    method: "POST",
    body: {} as { indicator_common_ids: string[] },
  }),

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

  // Create raw indicators (plural)
  createRawIndicators: route({
    path: "/indicators-raw",
    method: "POST",
    body: {} as {
      indicators: Array<{
        indicator_raw_id: string;
        indicator_raw_label: string;
        mapped_common_ids: string[];
      }>;
    },
  }),

  // Update raw indicator
  updateRawIndicator: route({
    path: "/indicators-raw/update",
    method: "POST",
    body: {} as {
      old_indicator_raw_id: string;
      new_indicator_raw_id: string;
      indicator_raw_label: string;
      mapped_common_ids: string[];
    },
  }),

  // Delete raw indicators
  deleteRawIndicators: route({
    path: "/indicators-raw/delete",
    method: "POST",
    body: {} as { indicator_raw_ids: string[] },
  }),

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

  // Batch upload indicators with mappings from CSV file
  batchUploadIndicators: route({
    path: "/indicators/batch",
    method: "POST",
    body: {} as { asset_file_name: string; replace_all_existing: boolean },
  }),

  // Batch upload raw indicators from CSV file
  batchUploadRawIndicators: route({
    path: "/indicators/batch-raw",
    method: "POST",
    body: {} as { asset_file_name: string; replace_all_existing: boolean },
  }),

  // Delete all non-default indicators and their mappings
  deleteAllIndicators: route({
    path: "/indicators/all",
    method: "DELETE",
  }),
} as const;
