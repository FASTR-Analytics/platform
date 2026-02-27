import { Hono } from "hono";
import { _FEEDBACK_EMAIL_RECIPIENTS } from "lib";
import { _SEND_GRID_API } from "../../exposed_env_vars.ts";
import { requireGlobalPermission } from "../../middleware/userPermission.ts";
import { requireProjectPermission } from "../../project_auth.ts";
import { defineRoute } from "../route-helpers.ts";

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
            personalizations: [{ to: [{ email: recipient }] }],
            from: {
              email: "noreply@fastr-analytics.org",
              name: "FASTR Analytics Platform",
            },
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
          console.error(
            `SendGrid error for ${recipient}: ${res.status} ${error}`,
          );
          failed.push(recipient);
        }
      } catch (error) {
        console.error(`Network error sending to ${recipient}:`, error);
        failed.push(recipient);
      }
    }

    if (failed.length > 0) {
      return c.json({
        success: true,
        data: { sent: false, failedRecipients: failed },
      });
    }

    return c.json({ success: true, data: { sent: true } });
  },
);

defineRoute(
  routesEmails,
  "sendHelpEmail",
  requireGlobalPermission(),
  async (c, { body }) => {
    const { feedbackType, description, projectLabel } = body;
    const userEmail = c.var.globalUser.email;

    const typeLabel = feedbackType === "bug" ? "Bug Report" : "Suggestion";
    const projectLine = projectLabel ? ` (Project: ${projectLabel})` : "";
    const projectHtmlLine = projectLabel
      ? `<p><strong>Project:</strong> ${projectLabel}</p>`
      : "";

    // Email to the user confirming receipt
    const userPlainText =
      feedbackType === "bug"
        ? `Thank you for reporting this bug. We have received your report and will look into it. We will contact you if we have any further questions.\n\nYour report:\n${description}`
        : `Thank you for your suggestion. We have received it and will take it into consideration. We will contact you if we have any further questions.\n\nYour suggestion:\n${description}`;

    const userHtmlBody =
      feedbackType === "bug"
        ? `<p>Thank you for reporting this bug. We have received your report and will look into it. We will contact you if we have any further questions.</p>`
        : `<p>Thank you for your suggestion. We have received it and will take it into consideration. We will contact you if we have any further questions.</p>`;

    const userHtml = `
<div style="font-family: sans-serif; color: #333;">
  ${userHtmlBody}
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p style="font-size: 12px; color: #888;"><strong>Your submission:</strong><br>${description.replace(/\n/g, "<br>")}</p>
</div>`.trim();

    // Email to the preset recipients with the full details
    const internalPlainText = `New ${typeLabel} from ${userEmail}${projectLine}\n\n${description}`;

    const internalHtml = `
<div style="font-family: sans-serif; color: #333;">
  <p><strong>Type:</strong> ${typeLabel}</p>
  <p><strong>From:</strong> ${userEmail}</p>
  ${projectHtmlLine}
  <hr style="border: none; border-top: 1px solid #ddd; margin: 24px 0;" />
  <p><strong>Description:</strong></p>
  <p>${description.replace(/\n/g, "<br>")}</p>
</div>`.trim();

    async function sendEmail(
      to: string,
      subject: string,
      plainText: string,
      html: string,
    ) {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${_SEND_GRID_API}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personalizations: [{ to: [{ email: to }] }],
          from: {
            email: "noreply@fastr-analytics.org",
            name: "FASTR Analytics Platform",
          },
          subject,
          content: [
            { type: "text/plain", value: plainText },
            { type: "text/html", value: html },
          ],
        }),
      });
      if (!res.ok) {
        const error = await res.text();
        console.error(`SendGrid error for ${to}: ${res.status} ${error}`);
      }
    }

    // Send confirmation to the user
    await sendEmail(
      userEmail,
      `We received your ${typeLabel.toLowerCase()}`,
      userPlainText,
      userHtml,
    );

    // Send notification to preset recipients
    for (const recipient of _FEEDBACK_EMAIL_RECIPIENTS) {
      await sendEmail(
        recipient,
        `[FASTR] New ${typeLabel} from ${userEmail}`,
        internalPlainText,
        internalHtml,
      );
    }

    return c.json({ success: true, data: { sent: true } });
  },
);
