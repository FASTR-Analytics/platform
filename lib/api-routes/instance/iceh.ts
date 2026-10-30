import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import type {
  IcehDataDetail,
  IcehDisplayData,
} from "../../types/dataset_iceh.ts";
import type {
  IcehImportRunSummary,
  IcehStep1Result,
} from "../../types/dataset_iceh_import.ts";
import { route } from "../route-utils.ts";

export const icehRouteRegistry = {
  getDatasetIcehDetail: route({
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    path: "/iceh/detail",
    response: {} as IcehDataDetail,
  }),
  getDatasetIcehDisplayData: route({
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    path: "/iceh/display-data",
    response: {} as IcehDisplayData,
  }),

  // ICEH import runs (config-on-client, run-on-server). The wizard is
  // client-local; its zip input is an ordinary instance asset (uploaded or
  // picked). No queue and no scheduler: a second launch while one runs is
  // refused.
  parseDatasetIcehZipPreview: route({
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/runs/parse-zip",
    body: z.object({ zipFileName: z.string() }),
    response: {} as IcehStep1Result,
  }),
  launchDatasetIcehRun: route({
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/runs",
    body: z.object({ zipFileName: z.string() }),
    response: {} as { runId: number },
  }),
  getDatasetIcehImportRuns: route({
    method: "GET",
    guard: GUARD.permission("can_view_data"),
    path: "/iceh/runs",
    response: {} as IcehImportRunSummary[],
  }),
  resolveDatasetIcehReview: route({
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/runs/resolve-review",
    body: z.object({
      runId: z.number().int(),
      action: z.enum(["integrate_anyway", "discard"]),
    }),
  }),
  cancelDatasetIcehRun: route({
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/runs/cancel",
    body: z.object({ runId: z.number().int() }),
  }),

  deleteDatasetIcehData: route({
    method: "DELETE",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/data",
  }),
  deleteDatasetIcehIndicators: route({
    method: "POST",
    guard: GUARD.permission("can_configure_data"),
    path: "/iceh/data/delete-indicators",
    body: z.object({ indicatorCodes: z.array(z.string()) }),
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
