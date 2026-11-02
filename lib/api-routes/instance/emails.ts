import { GUARD, type RouteGuard } from "../../permissions/mod.ts";
import { z } from "zod";
import { route } from "../route-utils.ts";

// Shared with the client so the send button applies exactly the rule the route
// enforces: a client-side copy of the email shape would drift and re-open the
// "export the whole PDF, then 400" path.
export const emailRecipientsSchema = z.array(z.email()).min(1).max(50);

// An attachment is a base64 file: at most 25,000,000 characters (about 18 MB),
// named by a bare file name of at most 200 characters.
const emailAttachmentContentSchema = z.string().max(25_000_000);
const emailAttachmentFilenameSchema = z.string().min(1).max(200).refine(
  (name) => !/[/\\]/.test(name),
  "The file name cannot contain a path separator",
);

// The attachment name for a product's label, the rule the schema enforces.
export function emailAttachmentFilename(
  label: string,
  extension: string,
): string {
  // A cut through a surrogate pair would leave a malformed name, so a lone
  // high surrogate at the cut goes.
  const base = label.replace(/[/\\]/g, "-").trim()
    .slice(0, 200 - extension.length - 1)
    .replace(/[\uD800-\uDBFF]$/, "")
    .trim() || "file";
  return `${base}.${extension}`;
}

export const emailRouteRegistry = {
  // The recipients on offer are the instance directory, a consequence of
  // the permissive access model: every approved user may send.
  sendSlideDeckEmail: route({
    path: "/emails/slide-deck",
    method: "POST",
    guard: GUARD.approved,
    body: z.object({
      recipients: emailRecipientsSchema,
      message: z.string(),
      attachment: z.object({
        content: emailAttachmentContentSchema,
        filename: emailAttachmentFilenameSchema,
      }),
    }),
    response: {} as { sent: boolean; failedRecipients?: string[] },
  }),
  // A report goes as its paged PDF. Approved-user access like the deck
  // route: the caller already holds the content it is sending.
  sendReportEmail: route({
    path: "/emails/report",
    method: "POST",
    guard: GUARD.approved,
    body: z.object({
      recipients: emailRecipientsSchema,
      message: z.string(),
      reportLabel: z.string(),
      attachment: z.object({
        content: emailAttachmentContentSchema,
        filename: emailAttachmentFilenameSchema,
        mimeType: z.literal("application/pdf"),
      }),
    }),
    response: {} as { sent: boolean; failedRecipients?: string[] },
  }),
  sendHelpEmail: route({
    path: "/emails/help",
    method: "POST",
    guard: GUARD.approved,
    body: z.object({
      feedbackType: z.enum(["bug", "suggestion", "help"]),
      description: z.string(),
      // Where in the app the report came from: the open product or the tab.
      context: z.string().optional(),
      images: z.array(z.object({
        content: z.string(),
        filename: z.string(),
        mimeType: z.string(),
      })).optional(),
    }),
    response: {} as { sent: boolean },
  }),
} as const satisfies Record<string, { guard: RouteGuard }>;
