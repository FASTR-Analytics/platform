import { Hono } from "hono";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { proxyAnthropicMessages } from "../anthropic_messages_proxy.ts";

export const routesCopilotAiProxy = new Hono();

// The copilot proxy, mounted at /ai, behind every per-product copilot mount
// (PLAN_PRODUCTS_RESTRUCTURE D15).
// Guarded by requireApprovedUser() and nothing finer: the copilot reads and
// writes products, and every approved user is a full editor of every product
// (D2). Usage is logged with a null project_id; the token limits are already
// user- and instance-scoped. Passthrough, governance and beta policy live in
// anthropic_messages_proxy.ts, shared with the HFA indicator manager's mount.
routesCopilotAiProxy.post("/v1/messages", requireApprovedUser(), async (c) => {
  return await proxyAnthropicMessages({
    parseBody: () => c.req.json(),
    clientBetaHeader: c.req.header("anthropic-beta"),
    userEmail: c.var.globalUser.email,
    unlimitedAi: c.var.globalUser.unlimitedAi,
    projectId: null,
    mainDb: c.var.mainDb,
  });
});
