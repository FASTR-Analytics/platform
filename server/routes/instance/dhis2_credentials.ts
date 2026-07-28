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
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { defineRoute } from "../route-helpers.ts";

// Instance-wide stored DHIS2 credentials, shared by every DHIS2 flow
// (PLAN_DHIS2_CREDENTIAL_STORE_CONSOLIDATION Phase 1).
export const routesDhis2Credentials = new Hono();

defineRoute(
  routesDhis2Credentials,
  "getInstanceDhis2CredentialsInfo",
  requireGlobalPermission("can_configure_data"),
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
  requireGlobalPermission("can_configure_data"),
  log("saveInstanceDhis2Credentials"),
  async (c, { body }) => {
    if (!isDhis2CredentialsEncryptionKeyConfigured()) {
      return c.json({
        success: false,
        err: "DHIS2_CREDENTIALS_ENCRYPTION_KEY is not set on this server — credentials cannot be stored.",
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
    return c.json({ success: true });
  },
);

defineRoute(
  routesDhis2Credentials,
  "deleteInstanceDhis2Credentials",
  requireGlobalPermission("can_configure_data"),
  log("deleteInstanceDhis2Credentials"),
  async (c) => {
    await deleteStoredDhis2Credentials(c.var.mainDb);
    return c.json({ success: true });
  },
);
