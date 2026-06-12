import { z } from "zod";
import { route } from "../route-utils.ts";

export const emailRouteRegistry = {
  sendSlideDeckEmail: route({
    path: "/emails/slide-deck",
    method: "POST",
    body: z.object({
      recipients: z.array(z.string()),
      message: z.string(),
      attachment: z.object({ content: z.string(), filename: z.string() }),
    }),
    response: {} as { sent: boolean; failedRecipients?: string[] },
    requiresProject: true,
  }),
  sendHelpEmail: route({
    path: "/emails/help",
    method: "POST",
    body: z.object({
      feedbackType: z.enum(["bug", "suggestion"]),
      description: z.string(),
      projectLabel: z.string().optional(),
      images: z.array(z.object({
        content: z.string(),
        filename: z.string(),
        mimeType: z.string(),
      })).optional(),
    }),
    response: {} as { sent: boolean },
  }),
} as const;
