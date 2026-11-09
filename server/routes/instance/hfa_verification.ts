import { Hono } from "hono";
import {
  getHfaVerification,
  getInstanceIndicatorsSummary,
  setHfaVerificationFindingsDismissed,
  setHfaVerificationRulesOff,
  startHfaVerificationRun,
  stopHfaVerificationRun,
} from "../../db/mod.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceIndicatorsUpdated } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesHfaVerification = new Hono();

defineRoute(
  routesHfaVerification,
  "getHfaVerification",
  log("getHfaVerification"),
  async (c) => {
    const res = await getHfaVerification(c.var.mainDb);
    return c.json(res);
  },
);

defineRoute(
  routesHfaVerification,
  "startHfaVerificationRun",
  log("startHfaVerificationRun"),
  async (c, { body }) => {
    const mainDb = c.var.mainDb;
    const notify = async () =>
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(mainDb),
      );
    const res = await startHfaVerificationRun(
      mainDb,
      body.indicatorIds,
      c.var.globalUser.email,
      notify,
    );
    if (res.success) await notify();
    return c.json(res);
  },
);

defineRoute(
  routesHfaVerification,
  "stopHfaVerificationRun",
  log("stopHfaVerificationRun"),
  async (c) => {
    const res = await stopHfaVerificationRun(c.var.mainDb);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaVerification,
  "setHfaVerificationFindingsDismissed",
  log("setHfaVerificationFindingsDismissed"),
  async (c, { body }) => {
    const res = await setHfaVerificationFindingsDismissed(
      c.var.mainDb,
      body.findingIds,
      body.dismissed,
      c.var.globalUser.email,
    );
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);

defineRoute(
  routesHfaVerification,
  "setHfaVerificationRulesOff",
  log("setHfaVerificationRulesOff"),
  async (c, { body }) => {
    const res = await setHfaVerificationRulesOff(c.var.mainDb, body.ruleIds);
    if (res.success) {
      notifyInstanceIndicatorsUpdated(
        await getInstanceIndicatorsSummary(c.var.mainDb),
      );
    }
    return c.json(res);
  },
);
