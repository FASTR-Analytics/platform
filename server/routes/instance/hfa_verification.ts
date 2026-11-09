import { Hono } from "hono";
import type { TransactionSql } from "postgres";
import {
  getHfaVerification,
  getInstanceIndicatorsSummary,
  saveHfaIndicatorVerifications,
  setHfaVerificationFindingsDismissed,
  setHfaVerificationRulesOff,
  tryCatchDatabaseAsync,
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
  "saveHfaIndicatorVerifications",
  log("saveHfaIndicatorVerifications"),
  async (c, { body }) => {
    const res = await tryCatchDatabaseAsync(async () => {
      await c.var.mainDb.begin((sql: TransactionSql) =>
        saveHfaIndicatorVerifications(
          sql,
          body.results,
          c.var.globalUser.email,
        )
      );
      return { success: true } as const;
    });
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
