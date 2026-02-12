import { Hono } from "hono";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";
import { _SEND_GRID_API } from "../../exposed_env_vars.ts";

export const routesEmails = new Hono();

defineRoute(
  routesEmails,
  "sendSlideDeckEmail",
  requireProjectPermission("can_view_slide_decks"),
  async (c, { body }) => {
    const { recipients, message, attachment } = body;

    const userEmail = c.var.globalUser.email;

    const plainText = `${message}\n\n---\nThis email was sent via FASTR Analytics on behalf of ${userEmail}.`;

    const htmlMessage = `
<div style="font-family: sans-serif; color: #333;">
  <p>${message.replace(/\n/g, "<br>")}</p>
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;">
    This email was sent via <strong>FASTR Analytics</strong> on behalf of ${userEmail}.
  </p>
</div>`.trim();

    const failed: string[] = [];

    for (const recipient of recipients) {
      try {
        const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${_SEND_GRID_API}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            personalizations: [
              { to: [{ email: recipient }] },
            ],
            from: { email: "noreply@fastr-analytics.org", name: "FASTR Analytics Platform" },
            subject: "Slide Deck from FASTR Analytics",
            content: [
              { type: "text/plain", value: plainText },
              { type: "text/html", value: htmlMessage },
            ],
            attachments: [
              {
                content: attachment.content,
                filename: attachment.filename,
                type: "application/pdf",
                disposition: "attachment",
              },
            ],
          }),
        });

        if (!res.ok) {
          const error = await res.text();
          console.error(`SendGrid error for ${recipient}: ${res.status} ${error}`);
          failed.push(recipient);
        }
      } catch (error) {
        console.error(`Network error sending to ${recipient}:`, error);
        failed.push(recipient);
      }
    }

    if (failed.length > 0) {
      return c.json({ success: true, data: { sent: false, failedRecipients: failed } });
    }

    return c.json({ success: true, data: { sent: true } });
  },
);
