import { Hono } from "hono";
import { requireGlobalPermission } from "../../middleware/mod.ts";
import { anthropicMessagesHandler } from "../anthropic_messages_proxy.ts";

export const routesInstanceAiProxy = new Hono();

// The HFA Indicator Manager's own assistant, mounted at /ai-instance. The
// SAME handler the copilot mount registers (copilot_ai_proxy.ts) — the guard
// is the only difference: this surface is the indicator dictionary editor, so
// it keeps can_configure_data, not the copilot's requireApprovedUser().
routesInstanceAiProxy.post(
  "/v1/messages",
  requireGlobalPermission("can_configure_data"),
  anthropicMessagesHandler,
);
