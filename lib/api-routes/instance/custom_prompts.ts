import type { CustomPrompt } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const customPromptRouteRegistry = {
  getCustomPrompts: route({
    path: "/custom_prompts",
    method: "GET",
    response: {} as CustomPrompt[],
  }),
  createCustomPrompt: route({
    path: "/custom_prompts",
    method: "POST",
    body: {} as { name: string; content: string; category: string; scope: "user" | "country" },
    response: {} as CustomPrompt,
  }),
  updateCustomPrompt: route({
    path: "/custom_prompts/:id",
    method: "PUT",
    params: {} as { id: string },
    body: {} as { name: string; content: string; category: string; scope: "user" | "country" },
    response: {} as CustomPrompt,
  }),
  deleteCustomPrompt: route({
    path: "/custom_prompts/:id",
    method: "DELETE",
    params: {} as { id: string },
  }),
} as const;
