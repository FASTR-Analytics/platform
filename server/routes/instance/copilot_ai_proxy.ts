import { Hono } from "hono";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesCopilotAiProxy = new Hono();

// The copilot proxy, mounted at /ai, behind the shell's chat. Guarded by
// requireApprovedUser() and nothing finer: the proxy reads and writes
// nothing. The chat's tools run in the browser and reach a product or the
// HFA indicators only through the routes, which guard themselves.
// The token limits are user- and instance-scoped. Passthrough, governance
// and beta policy live in anthropic_messages_proxy.ts.
routesCopilotAiProxy.post("/v1/messages", requireApprovedUser(), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    mainDb: c.var.mainDb,
  });
});
