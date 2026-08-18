import { z } from "zod";
import { route } from "../route-utils.ts";

// Shared with the client so the send button applies exactly the rule the route
// enforces — a client-side copy of the email shape would drift and re-open the
// "export the whole PDF, then 400" path.
export const emailRecipientsSchema = z.array(z.email()).min(1).max(50);

export const emailRouteRegistry = {
  sendSlideDeckEmail: route({
    path: "/emails/slide-deck",
    method: "POST",
    body: z.object({
      recipients: emailRecipientsSchema,
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
      feedbackType: z.enum(["bug", "suggestion", "help"]),
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
