import { Hono } from "hono";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesCopilotAiProxy = new Hono();

// The copilot proxy, mounted at /ai, behind every per-product copilot mount.
// Guarded by requireApprovedUser() and nothing finer: the proxy reads and
// writes no product. The copilot's tools run in the browser and reach a
// product only through the product routes and the collab socket, which guard
// each product themselves.
// The token limits are user- and instance-scoped. Passthrough, governance and beta policy live in
// anthropic_messages_proxy.ts, shared with the HFA indicator manager's mount.
routesCopilotAiProxy.post("/v1/messages", requireApprovedUser(), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    mainDb: c.var.mainDb,
  });
});
