import type { WhatsNewPost } from "../../types/mod.ts";
import { route } from "../route-utils.ts";

export const whatsNewRouteRegistry = {
  getWhatsNewPosts: route({
    path: "/whats_new",
    method: "GET",
    response: {} as WhatsNewPost[],
  }),
} as const;
