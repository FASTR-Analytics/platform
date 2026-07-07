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

// requireGlobalPermission() with no permissions only authenticates — it never
// checks `approved` (unlike requireProjectPermission). Prompts are a
// prompt-injection surface (country-scoped ones are offered to every user's
// copilot), so every handler rejects unapproved users, and publishing or
// re-scoping to "country" is admin-only.

defineRoute(routesCustomPrompts, "getCustomPrompts", requireGlobalPermission(), async (c) => {
  if (!c.var.globalUser.approved) {
    return c.json({ success: false, err: "User is not approved" }, 403);
  }
  const prompts = await getCustomPromptsForUser(c.var.mainDb, c.var.globalUser.email);
  return c.json({ success: true, data: prompts });
});

defineRoute(routesCustomPrompts, "createCustomPrompt", requireGlobalPermission(), async (c, { body }) => {
  if (!c.var.globalUser.approved) {
    return c.json({ success: false, err: "User is not approved" }, 403);
  }
  if (body.scope === "country" && !c.var.globalUser.isGlobalAdmin) {
    return c.json({ success: false, err: "Country-scoped prompts require admin access" }, 403);
  }
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
  if (!c.var.globalUser.approved) {
    return c.json({ success: false, err: "User is not approved" }, 403);
  }
  if (body.scope === "country" && !c.var.globalUser.isGlobalAdmin) {
    return c.json({ success: false, err: "Country-scoped prompts require admin access" }, 403);
  }
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
  if (!c.var.globalUser.approved) {
    return c.json({ success: false, err: "User is not approved" }, 403);
  }
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
