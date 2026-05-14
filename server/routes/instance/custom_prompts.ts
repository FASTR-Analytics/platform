import { Hono } from "hono";
import {
  createCustomPrompt,
  deleteCustomPrompt,
  getCustomPromptsForUser,
  updateCustomPrompt,
} from "../../db/mod.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCustomPrompts = new Hono();

defineRoute(routesCustomPrompts, "getCustomPrompts", requireGlobalPermission(), async (c) => {
  const prompts = await getCustomPromptsForUser(c.var.mainDb, c.var.globalUser.email);
  return c.json({ success: true, data: prompts });
});

defineRoute(routesCustomPrompts, "createCustomPrompt", requireGlobalPermission(), async (c, { body }) => {
  const prompt = await createCustomPrompt(c.var.mainDb, {
    id: crypto.randomUUID(),
    name: body.name,
    content: body.content,
    category: body.category,
    scope: body.scope,
    createdBy: c.var.globalUser.email,
  });
  return c.json({ success: true, data: prompt });
});

defineRoute(routesCustomPrompts, "updateCustomPrompt", requireGlobalPermission(), async (c, { params, body }) => {
  const prompt = await updateCustomPrompt(
    c.var.mainDb,
    params.id,
    c.var.globalUser.email,
    c.var.globalUser.isGlobalAdmin,
    body,
  );
  if (!prompt) {
    return c.json({ success: false, err: "Prompt not found or not authorized" }, 403);
  }
  return c.json({ success: true, data: prompt });
});

defineRoute(routesCustomPrompts, "deleteCustomPrompt", requireGlobalPermission(), async (c, { params }) => {
  const deleted = await deleteCustomPrompt(
    c.var.mainDb,
    params.id,
    c.var.globalUser.email,
    c.var.globalUser.isGlobalAdmin,
  );
  if (!deleted) {
    return c.json({ success: false, err: "Prompt not found or not authorized" }, 403);
  }
  return c.json({ success: true });
});
