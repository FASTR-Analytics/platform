import { Hono } from "hono";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { anthropicMessagesHandler } from "../anthropic_messages_proxy.ts";

export const routesCopilotAiProxy = new Hono();

// The copilot proxy, mounted at /ai — one instance-level mount for the
// Products page and both editor overlays (D15). Guarded by
// requireApprovedUser() and nothing finer: the copilot reads and writes
// products, and every approved user is a full editor of every product (D2).
// The passthrough, governance, and beta policy are in
// anthropic_messages_proxy.ts, whose handler this shares verbatim with the
// HFA indicator manager's mount (routes/instance/ai_proxy.ts).
routesCopilotAiProxy.post(
  "/v1/messages",
  requireApprovedUser(),
  anthropicMessagesHandler,
);
