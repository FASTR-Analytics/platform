import { Hono } from "hono";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesInstanceAiProxy = new Hono();

// Instance-level AI proxy — the same passthrough as the project proxy
// (routes/project/ai_proxy.ts), but guarded at instance level and not tied
// to a project. Powers the self-contained HFA Indicator Manager assistant.
// Usage is logged with a null project_id; token limits are already
// user/instance-scoped. Passthrough, governance, and beta policy live in
// anthropic_messages_proxy.ts.
routesInstanceAiProxy.post("/v1/messages", requireGlobalPermission("can_configure_data"), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    projectId: null,
    mainDb: c.var.mainDb,
  });
});
