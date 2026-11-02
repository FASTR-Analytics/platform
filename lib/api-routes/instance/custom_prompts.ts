import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import type { CustomPrompt } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

const customPromptBodySchema = z.object({
  name: z.string(),
  content: z.string(),
  category: z.string(),
  scope: z.enum(["user", "country"]),
});

const customPromptIdSchema = z.object({
  id: z.uuid(),
});

export const customPromptRouteRegistry = {
  getCustomPrompts: route({
    path: "/custom_prompts",
    method: "GET",
    guard: GUARD.approved,
    response: {} as CustomPrompt[],
  }),
  createCustomPrompt: route({
    path: "/custom_prompts",
    method: "POST",
    guard: GUARD.approved,
    body: customPromptBodySchema,
    response: {} as CustomPrompt,
  }),
  updateCustomPrompt: route({
    path: "/custom_prompts/:id",
    method: "PUT",
    guard: GUARD.approved,
    params: customPromptIdSchema,
    body: customPromptBodySchema,
    response: {} as CustomPrompt,
  }),
  deleteCustomPrompt: route({
    path: "/custom_prompts/:id",
    method: "DELETE",
    guard: GUARD.approved,
    params: customPromptIdSchema,
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
