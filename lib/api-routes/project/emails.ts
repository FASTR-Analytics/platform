import { route } from "../route-utils.ts";

export const emailRouteRegistry = {
  sendSlideDeckEmail: route({
    path: "/emails/slide-deck",
    method: "POST",
    body: {} as {
      recipients: string[];
      message: string;
      attachment: { content: string; filename: string };
    },
    response: {} as { sent: boolean; failedRecipients?: string[] },
    requiresProject: true,
  }),
};
