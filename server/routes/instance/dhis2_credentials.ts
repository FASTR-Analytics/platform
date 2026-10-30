import { Hono } from "hono";
import { t3 } from "lib";
import {
  deleteStoredDhis2Credentials,
  getStoredDhis2CredentialsInfo,
  isDhis2CredentialsEncryptionKeyConfigured,
  saveStoredDhis2Credentials,
} from "../../db/mod.ts";
import { validateDhis2Connection } from "../../dhis2/mod.ts";
import { log } from "../../middleware/logging.ts";
import { notifyInstanceConfigUpdatedFromDb } from "../../task_management/notify_instance_updated.ts";
import { defineRoute } from "../route-helpers.ts";

// Instance-wide stored DHIS2 credentials, shared by every DHIS2 flow.
export const routesDhis2Credentials = new Hono();

defineRoute(
  routesDhis2Credentials,
  "getInstanceDhis2CredentialsInfo",
  log("getInstanceDhis2CredentialsInfo"),
  async (c) => {
    const stored = await getStoredDhis2CredentialsInfo(c.var.mainDb);
    return c.json({
      success: true as const,
      data: {
        storedCredentials: stored ?? undefined,
        encryptionKeyConfigured: isDhis2CredentialsEncryptionKeyConfigured(),
      },
    });
  },
);

defineRoute(
  routesDhis2Credentials,
  "saveInstanceDhis2Credentials",
  log("saveInstanceDhis2Credentials"),
  async (c, { body }) => {
    if (!isDhis2CredentialsEncryptionKeyConfigured()) {
      return c.json({
        success: false,
        err:
          "DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on this server — credentials cannot be stored.",
      });
    }
    const validation = await validateDhis2Connection(body.credentials);
    if (!validation.valid) {
      return c.json({ success: false, err: t3(validation.message) });
    }
    await saveStoredDhis2Credentials(
      c.var.mainDb,
      body.credentials,
      c.var.globalUser?.email ?? "unknown",
    );
    // The Data page shows the connection as instance state, so a change has
    // to reach every open client the same way other config edits do.
    await notifyInstanceConfigUpdatedFromDb(c.var.mainDb);
    return c.json({ success: true });
  },
);

defineRoute(
  routesDhis2Credentials,
  "deleteInstanceDhis2Credentials",
  log("deleteInstanceDhis2Credentials"),
  async (c) => {
    await deleteStoredDhis2Credentials(c.var.mainDb);
    await notifyInstanceConfigUpdatedFromDb(c.var.mainDb);
    return c.json({ success: true });
  },
);
