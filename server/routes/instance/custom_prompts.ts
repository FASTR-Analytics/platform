import { Hono } from "hono";
import {
  createCustomPrompt,
  deleteCustomPrompt,
  getCustomPromptsForUser,
  updateCustomPrompt,
} from "../../db/mod.ts";
import { requireApprovedUser } from "../../middleware/userPermission.ts";
import { defineRoute } from "../route-helpers.ts";

export const routesCustomPrompts = new Hono();

// Prompts are a prompt-injection surface — a country-scoped one is offered to
// every user's copilot — so approval is the bar, not mere authentication.
// That used to be four hand-rolled `!globalUser.approved` checks behind a
// zero-permission requireGlobalPermission(), because no guard expressed it;
// requireApprovedUser() now does, and D2's doctrine is that the guard carries
// the rule and handlers never re-check it. Publishing or re-scoping to
// "country" stays admin-only, checked in the handler because it is a
// per-BODY rule, not a per-route one.

defineRoute(routesCustomPrompts, "getCustomPrompts", requireApprovedUser(), async (c) => {
  const prompts = await getCustomPromptsForUser(c.var.mainDb, c.var.globalUser.email);
  return c.json({ success: true, data: prompts });
});

defineRoute(routesCustomPrompts, "createCustomPrompt", requireApprovedUser(), async (c, { body }) => {
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

defineRoute(routesCustomPrompts, "updateCustomPrompt", requireApprovedUser(), async (c, { params, body }) => {
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

defineRoute(routesCustomPrompts, "deleteCustomPrompt", requireApprovedUser(), async (c, { params }) => {
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
