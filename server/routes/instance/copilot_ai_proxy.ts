import { Hono } from "hono";
import { requireProjectPermission } from "../../project_auth.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesAiProxy = new Hono();

// Project-level AI proxy — guard + usage attribution only; the passthrough,
// governance, and beta policy are in anthropic_messages_proxy.ts (shared
// with the instance proxy).
routesAiProxy.post("/v1/messages", requireProjectPermission(), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    projectId: c.var.ppk.projectId,
    mainDb: c.var.mainDb,
  });
});
