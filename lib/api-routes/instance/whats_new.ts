import { z } from "zod";
import type { WhatsNewPost } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const whatsNewRouteRegistry = {
  getWhatsNewPosts: route({
    path: "/whats_new",
    method: "GET",
    response: {} as WhatsNewPost[],
  }),
  recordWhatsNewEvent: route({
    path: "/whats_new/event",
    method: "POST",
    body: z.object({
      postId: z.string().max(100),
      event: z.enum(["seen", "skipped", "completed"]),
    }),
  }),
} as const;
