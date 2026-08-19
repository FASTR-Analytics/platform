import { Hono } from "hono";
import { AddLog } from "../../db/instance/user_logs.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesOnboarding = new Hono();

// Guided-tour telemetry, written through the user-log pipeline's writer like
// the What's New popup events. The tour id is encoded in the endpoint name
// ("tour_<event>:<tourId>") so per-tour start/finish/abort counts survive the
// 7-day rollup into user_logs_aggregate; the details blob carries the rest
// (page, trigger, and for aborts the step reached and why it ended) for the
// raw window. Only start/finish/abort are recorded — per-step events would
// multiply the row count for little extra signal, since an abort already
// says how far the user got.
defineRoute(routesOnboarding, "recordTourEvent", requireGlobalPermission(), async (c, { body }) => {
  if (c.var.globalUser.approved) {
    const details: Record<string, unknown> = { page: body.page, trigger: body.trigger };
    if (body.stepIndex !== undefined) details.stepIndex = body.stepIndex;
    if (body.stepId !== undefined) details.stepId = body.stepId;
    if (body.reason !== undefined) details.reason = body.reason;
    AddLog(
      c.var.mainDb,
      c.var.globalUser.email,
      `tour_${body.event}:${body.tourId}`,
      "200",
      JSON.stringify(details),
    ).catch(() => {});
  }
  return c.json({ success: true });
});
