import { z } from "zod";
import type { InstanceIndicatorDetails } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const commonIndicatorItemSchema = z.object({
  indicator_common_id: z.string(),
  indicator_common_label: z.string(),
  mapped_raw_ids: z.array(z.string()),
});

const rawIndicatorItemSchema = z.object({
  indicator_raw_id: z.string(),
  indicator_raw_label: z.string(),
  mapped_common_ids: z.array(z.string()),
});

const batchUploadBodySchema = z.object({
  asset_file_name: z.string(),
  replace_all_existing: z.boolean(),
});

export const indicatorRouteRegistry = {
  getIndicators: route({
    path: "/indicators",
    method: "GET",
    response: {} as InstanceIndicatorDetails,
  }),
  createCommonIndicators: route({
    path: "/indicators",
    method: "POST",
    body: z.object({ indicators: z.array(commonIndicatorItemSchema) }),
  }),
  updateCommonIndicator: route({
    path: "/indicators/update",
    method: "POST",
    body: z.object({
      old_indicator_common_id: z.string(),
      new_indicator_common_id: z.string(),
      indicator_common_label: z.string(),
      mapped_raw_ids: z.array(z.string()),
    }),
  }),
  deleteCommonIndicators: route({
    path: "/indicators/delete",
    method: "POST",
    body: z.object({ indicator_common_ids: z.array(z.string()) }),
  }),
  createRawIndicators: route({
    path: "/indicators-raw",
    method: "POST",
    body: z.object({ indicators: z.array(rawIndicatorItemSchema) }),
  }),
  updateRawIndicator: route({
    path: "/indicators-raw/update",
    method: "POST",
    body: z.object({
      old_indicator_raw_id: z.string(),
      new_indicator_raw_id: z.string(),
      indicator_raw_label: z.string(),
      mapped_common_ids: z.array(z.string()),
    }),
  }),
  deleteRawIndicators: route({
    path: "/indicators-raw/delete",
    method: "POST",
    body: z.object({ indicator_raw_ids: z.array(z.string()) }),
  }),
  batchUploadIndicators: route({
    path: "/indicators/batch",
    method: "POST",
    body: batchUploadBodySchema,
  }),
  batchUploadRawIndicators: route({
    path: "/indicators/batch-raw",
    method: "POST",
    body: batchUploadBodySchema,
  }),
} as const;
