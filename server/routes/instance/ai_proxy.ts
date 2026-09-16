import { Hono } from "hono";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesInstanceAiProxy = new Hono();

// The HFA Indicator Manager assistant's proxy: the same passthrough as the
// copilot's /ai mount (copilot_ai_proxy.ts), guarded by can_configure_data.
// Token limits are user- and instance-scoped. Passthrough, governance, and beta
// policy live in anthropic_messages_proxy.ts.
routesInstanceAiProxy.post("/v1/messages", requireGlobalPermission("can_configure_data"), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    mainDb: c.var.mainDb,
  });
});
